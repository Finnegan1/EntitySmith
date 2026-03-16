//! Stage-3 Candidate Graph Generation engine.
//!
//! Implements three detection methods:
//!   3a-i.  Declared FKs      → high confidence (0.95), origin DeclaredFk
//!   3a-ii. Soft FKs          → column-name pattern {entity}_id, confidence 0.70
//!   3b-i.  Cross-source name → Jaro-Winkler + structural heuristics
//!   3b-ii. Cross-source values → top-value set overlap
//!
//! Embeddings (Level 2) and LLM reasoning (Level 3) are deferred to Phase 11.
//!
//! One `Proposal` is produced per unique connection endpoint pair. If multiple
//! detection methods fire for the same pair, they accumulate as separate `reasons`
//! entries on the same proposal. Combined confidence uses the independent-evidence
//! formula: 1 − Π(1 − cᵢ).

use std::collections::{HashMap, HashSet};

use chrono::Utc;
use uuid::Uuid;

use crate::domain::{
    EntityWithAttributes, FkCandidate, Proposal, ProposalKind, ProposalOrigin,
    ProposalReason, ProposalStatus, SourceAttributeProfile, TopValue,
};

// ── Input type ────────────────────────────────────────────────────────────────

/// All data for one profiled source required by the engine.
pub struct SourceData {
    pub source_id: String,
    pub entities: Vec<EntityWithAttributes>,
    pub fk_candidates: Vec<FkCandidate>,
}

// ── Entry point ───────────────────────────────────────────────────────────────

/// Generate all Stage-3 connection proposals for the given set of profiled sources.
///
/// Returns one `Proposal` per unique endpoint pair; multiple detection methods
/// that fire for the same pair are merged into that proposal's `reasons` list.
pub fn generate_proposals(project_id: &str, sources: &[SourceData]) -> Vec<Proposal> {
    let mut raw: Vec<(ConnectionKey, ProposalReason, String, String)> = Vec::new();
    // Each entry: (connection key, reason, suggested_predicate, suggested_cardinality)

    // ── 3a: Intra-source ─────────────────────────────────────────────────────

    for src in sources {
        for fk in src.fk_candidates.iter().filter(|f| f.is_declared) {
            let (key, reason, pred, card) =
                declared_fk_reason(project_id, &src.source_id, fk);
            raw.push((key, reason, pred, card));
        }

        for item in intra_source_soft_fk_reasons(project_id, src) {
            raw.push(item);
        }
    }

    // ── 3b: Cross-source ─────────────────────────────────────────────────────

    for i in 0..sources.len() {
        for j in (i + 1)..sources.len() {
            for item in cross_source_reasons(project_id, &sources[i], &sources[j]) {
                raw.push(item);
            }
        }
    }

    merge_into_proposals(project_id, raw)
}

// ── Connection key ────────────────────────────────────────────────────────────

/// Identifies a unique connection endpoint pair (independent of detection method).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct ConnectionKey {
    from_source_id: String,
    from_entity: String,
    from_column: String,
    to_source_id: String,
    to_entity: String,
    to_column: String,
}

impl ConnectionKey {
    /// Deterministic UUID v5 for this endpoint pair (kind excluded by design).
    fn proposal_id(&self, project_id: &str) -> String {
        let logical_key = format!(
            "{}|{}|{}|{}|{}|{}|{}",
            project_id,
            self.from_source_id,
            self.from_entity,
            self.from_column,
            self.to_source_id,
            self.to_entity,
            self.to_column,
        );
        Uuid::new_v5(&Uuid::NAMESPACE_OID, logical_key.as_bytes()).to_string()
    }
}

// ── 3a-i: Declared FK ─────────────────────────────────────────────────────────

fn declared_fk_reason(
    project_id: &str,
    source_id: &str,
    fk: &FkCandidate,
) -> (ConnectionKey, ProposalReason, String, String) {
    let key = ConnectionKey {
        from_source_id: source_id.to_string(),
        from_entity: fk.from_entity.clone(),
        from_column: fk.from_column.clone(),
        to_source_id: source_id.to_string(),
        to_entity: fk.to_entity.clone(),
        to_column: fk.to_column.clone(),
    };
    let reason = ProposalReason {
        kind: ProposalKind::ForeignKey,
        origin: ProposalOrigin::DeclaredFk,
        confidence: 0.95,
        evidence: serde_json::json!({
            "is_declared": true,
            "link_columns": [{ "from": fk.from_column, "to": fk.to_column }]
        }),
    };
    let pred = derive_predicate_from_col(&fk.from_column, &fk.to_entity);
    let _ = project_id; // used only for key ID, no local use needed here
    (key, reason, pred, "one_to_many".to_string())
}

// ── 3a-ii: Soft FK (intra-source) ─────────────────────────────────────────────

fn intra_source_soft_fk_reasons(
    project_id: &str,
    src: &SourceData,
) -> Vec<(ConnectionKey, ProposalReason, String, String)> {
    let mut items = Vec::new();
    let _ = project_id;

    for entity_a in &src.entities {
        for attr_a in entity_a.attributes.iter().filter(|a| !a.is_pk) {
            let Some(prefix) = fk_pattern_prefix(&attr_a.name) else { continue };

            let Some(entity_b) = src
                .entities
                .iter()
                .find(|e| e.profile.name != entity_a.profile.name && names_match(&e.profile.name, &prefix))
            else {
                continue;
            };

            let Some(pk_col) = entity_b.attributes.iter().find(|a| a.is_pk) else {
                continue;
            };

            let key = ConnectionKey {
                from_source_id: src.source_id.clone(),
                from_entity: entity_a.profile.name.clone(),
                from_column: attr_a.name.clone(),
                to_source_id: src.source_id.clone(),
                to_entity: entity_b.profile.name.clone(),
                to_column: pk_col.name.clone(),
            };
            let reason = ProposalReason {
                kind: ProposalKind::SoftForeignKey,
                origin: ProposalOrigin::Heuristic,
                confidence: 0.70,
                evidence: serde_json::json!({
                    "pattern": format!("{}_id", prefix),
                    "to_pk": pk_col.name,
                    "method": "column_name_pattern"
                }),
            };
            let pred = derive_predicate_from_col(&attr_a.name, &entity_b.profile.name);
            items.push((key, reason, pred, "one_to_many".to_string()));
        }
    }

    items
}

// ── 3b: Cross-source ──────────────────────────────────────────────────────────

fn cross_source_reasons(
    project_id: &str,
    src_a: &SourceData,
    src_b: &SourceData,
) -> Vec<(ConnectionKey, ProposalReason, String, String)> {
    let mut items = Vec::new();
    let _ = project_id;

    for entity_a in &src_a.entities {
        for attr_a in &entity_a.attributes {
            for entity_b in &src_b.entities {
                for attr_b in &entity_b.attributes {
                    let result = score_cross_source_pair(
                        &entity_a.profile.name,
                        attr_a,
                        &entity_b.profile.name,
                        attr_b,
                    );

                    if result.total_score < 0.40 {
                        continue;
                    }

                    let kind = if result.value_overlap > 0.30
                        && !attr_a.top_values.is_empty()
                        && !attr_b.top_values.is_empty()
                    {
                        ProposalKind::SampleValueOverlap
                    } else {
                        ProposalKind::ColumnNameSimilarity
                    };

                    let key = ConnectionKey {
                        from_source_id: src_a.source_id.clone(),
                        from_entity: entity_a.profile.name.clone(),
                        from_column: attr_a.name.clone(),
                        to_source_id: src_b.source_id.clone(),
                        to_entity: entity_b.profile.name.clone(),
                        to_column: attr_b.name.clone(),
                    };
                    let reason = ProposalReason {
                        kind,
                        origin: ProposalOrigin::Heuristic,
                        confidence: result.total_score.min(1.0),
                        evidence: serde_json::json!({
                            "name_score": result.name_score,
                            "fk_pattern_score": result.fk_pattern_score,
                            "jaro_winkler": result.jaro_winkler,
                            "value_overlap": result.value_overlap,
                            "total_score": result.total_score,
                        }),
                    };
                    let pred = derive_predicate_from_col(&attr_a.name, &entity_b.profile.name);
                    items.push((key, reason, pred, "unknown".to_string()));
                }
            }
        }
    }

    items
}

// ── Merge into proposals ──────────────────────────────────────────────────────

/// Merge raw (key, reason) pairs into one `Proposal` per unique connection key.
///
/// When multiple reasons share the same key, they accumulate on the same proposal.
/// If two reasons share the same `kind`, the higher-confidence one wins.
/// Combined proposal confidence = 1 − Π(1 − cᵢ) (independent-evidence formula).
fn merge_into_proposals(
    project_id: &str,
    raw: Vec<(ConnectionKey, ProposalReason, String, String)>,
) -> Vec<Proposal> {
    // Map: ConnectionKey → (reasons_map, predicate, cardinality)
    // reasons_map: kind_str → best ProposalReason for that kind
    let mut map: HashMap<ConnectionKey, (HashMap<String, ProposalReason>, String, String)> =
        HashMap::new();

    for (key, reason, pred, card) in raw {
        let entry = map
            .entry(key)
            .or_insert_with(|| (HashMap::new(), pred.clone(), card.clone()));

        let kind_key = reason.kind.to_db_str().to_string();
        // Keep the higher-confidence reason if the same kind fires twice
        match entry.0.get(&kind_key) {
            Some(existing) if existing.confidence >= reason.confidence => {}
            _ => {
                entry.0.insert(kind_key, reason);
            }
        }
    }

    let now = Utc::now().to_rfc3339();
    let mut proposals: Vec<Proposal> = map
        .into_iter()
        .map(|(key, (reasons_map, pred, card))| {
            let mut reasons: Vec<ProposalReason> = reasons_map.into_values().collect();
            // Sort reasons: highest confidence first
            reasons.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));

            let confidence = combined_confidence(&reasons);
            let id = key.proposal_id(project_id);

            Proposal {
                id,
                project_id: project_id.to_string(),
                status: ProposalStatus::Pending,
                confidence,
                from_source_id: key.from_source_id,
                from_entity: key.from_entity,
                from_column: key.from_column,
                to_source_id: key.to_source_id,
                to_entity: key.to_entity,
                to_column: key.to_column,
                suggested_predicate: pred,
                suggested_cardinality: card,
                reviewed_predicate: None,
                reviewed_cardinality: None,
                reasons,
                created_at: now.clone(),
                updated_at: now.clone(),
            }
        })
        .collect();

    proposals.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));
    proposals
}

/// Combined confidence across independent evidence sources.
/// Formula: 1 − Π(1 − cᵢ), capped at 1.0.
fn combined_confidence(reasons: &[ProposalReason]) -> f64 {
    let complement: f64 = reasons.iter().map(|r| 1.0 - r.confidence).product();
    (1.0 - complement).min(1.0)
}

// ── Scoring ───────────────────────────────────────────────────────────────────

struct PairScore {
    name_score: f64,
    fk_pattern_score: f64,
    jaro_winkler: f64,
    value_overlap: f64,
    total_score: f64,
}

fn score_cross_source_pair(
    entity_a_name: &str,
    attr_a: &SourceAttributeProfile,
    entity_b_name: &str,
    attr_b: &SourceAttributeProfile,
) -> PairScore {
    let mut score = 0.0_f64;

    // ── Column name matching ──────────────────────────────────────────────────
    let name_score = if attr_a.name == attr_b.name {
        0.4
    } else if normalize_col(&attr_a.name) == normalize_col(&attr_b.name) {
        0.3
    } else {
        0.0
    };
    score += name_score;

    // ── FK pattern ───────────────────────────────────────────────────────────
    let mut fk_score = 0.0_f64;
    if let Some(prefix_a) = fk_pattern_prefix(&attr_a.name) {
        if names_match(entity_b_name, &prefix_a) && attr_b.is_pk {
            fk_score = 0.80;
        }
    }
    score += fk_score;

    // ── Jaro-Winkler similarity ───────────────────────────────────────────────
    let norm_a = normalize_col(&attr_a.name);
    let norm_b = normalize_col(&attr_b.name);
    let jw = if norm_a.len() > 2 && norm_b.len() > 2 {
        strsim::jaro_winkler(&norm_a, &norm_b)
    } else {
        0.0
    };
    let jw_contribution = if jw > 0.85 { (jw - 0.85) * 2.0 } else { 0.0 };
    score += jw_contribution;

    // ── Both PKs with same inferred type ─────────────────────────────────────
    if attr_a.is_pk && attr_b.is_pk && attr_a.inferred_type == attr_b.inferred_type {
        score += 0.10;
    }

    // ── Top-value overlap ────────────────────────────────────────────────────
    let overlap = compute_value_overlap(&attr_a.top_values, &attr_b.top_values);
    score += overlap * 0.30;

    let _ = entity_a_name;

    PairScore {
        name_score,
        fk_pattern_score: fk_score,
        jaro_winkler: jw,
        value_overlap: overlap,
        total_score: score,
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn fk_pattern_prefix(col: &str) -> Option<String> {
    let lower = col.to_lowercase();
    for suffix in &["_id", "_key", "_ref", "_fk", "_code"] {
        if lower.ends_with(suffix) && lower.len() > suffix.len() {
            return Some(lower[..lower.len() - suffix.len()].to_string());
        }
    }
    if col.ends_with("Id") && col.len() > 2 {
        return Some(col[..col.len() - 2].to_lowercase());
    }
    if col.ends_with("Key") && col.len() > 3 {
        return Some(col[..col.len() - 3].to_lowercase());
    }
    None
}

fn normalize_col(col: &str) -> String {
    let base = fk_pattern_prefix(col).unwrap_or_else(|| col.to_lowercase());
    base.replace('_', "").replace('-', "").replace(' ', "")
}

fn names_match(entity: &str, reference: &str) -> bool {
    let a = entity.to_lowercase();
    let b = reference.to_lowercase();
    a == b
        || a == format!("{b}s")
        || b == format!("{a}s")
        || a == format!("{b}es")
        || b == format!("{a}es")
}

fn derive_predicate_from_col(from_col: &str, to_entity: &str) -> String {
    if let Some(prefix) = fk_pattern_prefix(from_col) {
        return format!("has_{prefix}");
    }
    let entity = to_entity
        .to_lowercase()
        .trim_end_matches('s')
        .replace(' ', "_")
        .to_string();
    format!("has_{entity}")
}

fn compute_value_overlap(a: &[TopValue], b: &[TopValue]) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let set_b: HashSet<&str> = b.iter().map(|v| v.value.as_str()).collect();
    let shared = a.iter().filter(|v| set_b.contains(v.value.as_str())).count();
    shared as f64 / a.len().min(b.len()) as f64
}
