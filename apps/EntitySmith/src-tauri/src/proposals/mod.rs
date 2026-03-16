//! Stage-3 Candidate Graph Generation engine.
//!
//! Implements three detection methods:
//!   3a-i.  Declared FKs      → high confidence (0.95), origin DeclaredFk
//!   3a-ii. Soft FKs          → column-name pattern {entity}_id, confidence 0.70
//!   3b-i.  Cross-source name → Jaro-Winkler + structural heuristics
//!   3b-ii. Cross-source values → top-value set overlap
//!
//! Embeddings (Level 2) and LLM reasoning (Level 3) are deferred to Phase 11.

use std::collections::{HashMap, HashSet};

use chrono::Utc;
use uuid::Uuid;

use crate::domain::{
    EntityWithAttributes, FkCandidate, Proposal, ProposalKind, ProposalOrigin,
    ProposalStatus, SourceAttributeProfile, TopValue,
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
/// Results are deduplicated by (kind, from_source, from_entity, from_col, to_source,
/// to_entity, to_col) — highest confidence wins within each kind+endpoint tuple.
pub fn generate_proposals(project_id: &str, sources: &[SourceData]) -> Vec<Proposal> {
    let mut raw: Vec<Proposal> = Vec::new();

    // ── 3a: Intra-source ─────────────────────────────────────────────────────

    for src in sources {
        // Declared FKs → near-certain proposals
        for fk in src.fk_candidates.iter().filter(|f| f.is_declared) {
            raw.push(make_declared_fk_proposal(project_id, &src.source_id, fk));
        }

        // Soft FKs: detect {entity}_id naming pattern within the same source
        raw.extend(intra_source_soft_fk_proposals(project_id, src));
    }

    // ── 3b: Cross-source ─────────────────────────────────────────────────────

    for i in 0..sources.len() {
        for j in (i + 1)..sources.len() {
            raw.extend(cross_source_proposals(
                project_id,
                &sources[i],
                &sources[j],
            ));
        }
    }

    deduplicate(raw)
}

// ── 3a-i: Declared FK proposals ───────────────────────────────────────────────

fn make_declared_fk_proposal(
    project_id: &str,
    source_id: &str,
    fk: &FkCandidate,
) -> Proposal {
    let predicate = derive_predicate_from_col(&fk.from_column, &fk.to_entity);
    let evidence = serde_json::json!({
        "is_declared": true,
        "link_columns": [{ "from": fk.from_column, "to": fk.to_column }]
    });

    make_proposal(
        project_id,
        ProposalKind::ForeignKey,
        ProposalStatus::Pending,
        0.95,
        ProposalOrigin::DeclaredFk,
        source_id,
        &fk.from_entity,
        &fk.from_column,
        source_id,
        &fk.to_entity,
        &fk.to_column,
        &predicate,
        "one_to_many",
        evidence,
    )
}

// ── 3a-ii: Soft FK proposals (intra-source) ───────────────────────────────────

fn intra_source_soft_fk_proposals(project_id: &str, src: &SourceData) -> Vec<Proposal> {
    let mut proposals = Vec::new();

    for entity_a in &src.entities {
        for attr_a in entity_a.attributes.iter().filter(|a| !a.is_pk) {
            let Some(prefix) = fk_pattern_prefix(&attr_a.name) else { continue };

            // Look for another entity whose name matches the extracted prefix
            let Some(entity_b) = src
                .entities
                .iter()
                .find(|e| e.profile.name != entity_a.profile.name && names_match(&e.profile.name, &prefix))
            else {
                continue;
            };

            // entity_b must have a PK column
            let Some(pk_col) = entity_b.attributes.iter().find(|a| a.is_pk) else {
                continue;
            };

            let evidence = serde_json::json!({
                "pattern": format!("{}_id", prefix),
                "to_pk": pk_col.name,
                "method": "column_name_pattern"
            });

            proposals.push(make_proposal(
                project_id,
                ProposalKind::SoftForeignKey,
                ProposalStatus::Pending,
                0.70,
                ProposalOrigin::Heuristic,
                &src.source_id,
                &entity_a.profile.name,
                &attr_a.name,
                &src.source_id,
                &entity_b.profile.name,
                &pk_col.name,
                &derive_predicate_from_col(&attr_a.name, &entity_b.profile.name),
                "one_to_many",
                evidence,
            ));
        }
    }

    proposals
}

// ── 3b: Cross-source proposals ────────────────────────────────────────────────

fn cross_source_proposals(
    project_id: &str,
    src_a: &SourceData,
    src_b: &SourceData,
) -> Vec<Proposal> {
    let mut proposals = Vec::new();

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

                    let evidence = serde_json::json!({
                        "name_score": result.name_score,
                        "fk_pattern_score": result.fk_pattern_score,
                        "jaro_winkler": result.jaro_winkler,
                        "value_overlap": result.value_overlap,
                        "total_score": result.total_score,
                    });

                    proposals.push(make_proposal(
                        project_id,
                        kind,
                        ProposalStatus::Pending,
                        result.total_score.min(1.0),
                        ProposalOrigin::Heuristic,
                        &src_a.source_id,
                        &entity_a.profile.name,
                        &attr_a.name,
                        &src_b.source_id,
                        &entity_b.profile.name,
                        &attr_b.name,
                        &derive_predicate_from_col(&attr_a.name, &entity_b.profile.name),
                        "unknown",
                        evidence,
                    ));
                }
            }
        }
    }

    proposals
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
        0.4 // exact name match
    } else if normalize_col(&attr_a.name) == normalize_col(&attr_b.name) {
        0.3 // normalized match (strips separators / casing)
    } else {
        0.0
    };
    score += name_score;

    // ── FK pattern: col_a is named {entity_b}_id / {entity_b}Id ─────────────
    let mut fk_score = 0.0_f64;
    if let Some(prefix_a) = fk_pattern_prefix(&attr_a.name) {
        if names_match(entity_b_name, &prefix_a) && attr_b.is_pk {
            fk_score = 0.80;
        }
    }
    // Also check reverse direction (but we only create forward proposal here)
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

    // Suppress entity_a_name / entity_b_name "unused variable" warnings — they
    // are here for future use (e.g., entity-name boosting heuristics).
    let _ = entity_a_name;
    let _ = entity_b_name;

    PairScore {
        name_score,
        fk_pattern_score: fk_score,
        jaro_winkler: jw,
        value_overlap: overlap,
        total_score: score,
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Extract the entity-reference prefix from an FK-style column name.
/// Returns None if no FK pattern is detected.
///
/// Examples:
///   "user_id" → Some("user")
///   "userId"  → Some("user")
///   "order_key" → Some("order")
///   "id"       → None
///   "name"     → None
fn fk_pattern_prefix(col: &str) -> Option<String> {
    let lower = col.to_lowercase();
    for suffix in &["_id", "_key", "_ref", "_fk", "_code"] {
        if lower.ends_with(suffix) && lower.len() > suffix.len() {
            return Some(lower[..lower.len() - suffix.len()].to_string());
        }
    }
    // CamelCase: ends with "Id", "Key", "Ref"
    if col.ends_with("Id") && col.len() > 2 {
        return Some(col[..col.len() - 2].to_lowercase());
    }
    if col.ends_with("Key") && col.len() > 3 {
        return Some(col[..col.len() - 3].to_lowercase());
    }
    None
}

/// Normalize a column name for similarity comparison:
/// lowercases and strips separators (_, -, spaces).
/// FK suffixes are also stripped so "user_id" and "userId" both become "user".
fn normalize_col(col: &str) -> String {
    let base = fk_pattern_prefix(col).unwrap_or_else(|| col.to_lowercase());
    base.replace('_', "").replace('-', "").replace(' ', "")
}

/// True if two entity names refer to the same concept,
/// accounting for simple pluralisation.
fn names_match(entity: &str, reference: &str) -> bool {
    let a = entity.to_lowercase();
    let b = reference.to_lowercase();
    a == b
        || a == format!("{b}s")
        || b == format!("{a}s")
        || a == format!("{b}es")
        || b == format!("{a}es")
}

/// Derive a human-readable predicate from a column name and target entity.
/// e.g. "user_id" + "users" → "has_user"
fn derive_predicate_from_col(from_col: &str, to_entity: &str) -> String {
    // Strip FK suffix to get the semantic core
    if let Some(prefix) = fk_pattern_prefix(from_col) {
        return format!("has_{prefix}");
    }
    // Fallback: derive from target entity name
    let entity = to_entity
        .to_lowercase()
        .trim_end_matches('s')
        .replace(' ', "_")
        .to_string();
    format!("has_{entity}")
}

/// Compute the fraction of values in `a` that also appear in `b`.
/// Returns 0.0 if either set is empty.
fn compute_value_overlap(a: &[TopValue], b: &[TopValue]) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let set_b: HashSet<&str> = b.iter().map(|v| v.value.as_str()).collect();
    let shared = a.iter().filter(|v| set_b.contains(v.value.as_str())).count();
    shared as f64 / a.len().min(b.len()) as f64
}

/// Build a Proposal with all fields set.
///
/// The proposal ID is a deterministic UUID v5 derived from the logical key
/// (project_id, kind, from_source, from_entity, from_col, to_source, to_entity,
/// to_col). This ensures that re-running analysis produces the same ID for the
/// same logical proposal, so `INSERT OR IGNORE` in `save_proposals` correctly
/// skips proposals that have already been accepted or rejected.
#[allow(clippy::too_many_arguments)]
fn make_proposal(
    project_id: &str,
    kind: ProposalKind,
    status: ProposalStatus,
    confidence: f64,
    origin: ProposalOrigin,
    from_source_id: &str,
    from_entity: &str,
    from_column: &str,
    to_source_id: &str,
    to_entity: &str,
    to_column: &str,
    suggested_predicate: &str,
    suggested_cardinality: &str,
    evidence: serde_json::Value,
) -> Proposal {
    let now = Utc::now().to_rfc3339();
    let logical_key = format!(
        "{}|{}|{}|{}|{}|{}|{}|{}",
        project_id,
        kind.to_db_str(),
        from_source_id,
        from_entity,
        from_column,
        to_source_id,
        to_entity,
        to_column,
    );
    let id = Uuid::new_v5(&Uuid::NAMESPACE_OID, logical_key.as_bytes()).to_string();
    Proposal {
        id,
        project_id: project_id.to_string(),
        kind,
        status,
        confidence,
        origin,
        from_source_id: from_source_id.to_string(),
        from_entity: from_entity.to_string(),
        from_column: from_column.to_string(),
        to_source_id: to_source_id.to_string(),
        to_entity: to_entity.to_string(),
        to_column: to_column.to_string(),
        suggested_predicate: suggested_predicate.to_string(),
        suggested_cardinality: suggested_cardinality.to_string(),
        reviewed_predicate: None,
        reviewed_cardinality: None,
        evidence,
        created_at: now.clone(),
        updated_at: now,
    }
}

/// Remove duplicates keeping the highest-confidence entry per
/// (kind, from_source_id, from_entity, from_column, to_source_id, to_entity, to_column) tuple.
fn deduplicate(proposals: Vec<Proposal>) -> Vec<Proposal> {
    let mut best: HashMap<String, Proposal> = HashMap::new();

    for p in proposals {
        let key = format!(
            "{}|{}|{}|{}|{}|{}|{}",
            p.kind.to_db_str(),
            p.from_source_id,
            p.from_entity,
            p.from_column,
            p.to_source_id,
            p.to_entity,
            p.to_column,
        );
        match best.get(&key) {
            Some(existing) if existing.confidence >= p.confidence => {}
            _ => {
                best.insert(key, p);
            }
        }
    }

    let mut result: Vec<Proposal> = best.into_values().collect();
    result.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));
    result
}
