// Domain model — core EntitySmith types.

use serde::{Deserialize, Serialize};

/// A stable identifier used across all domain objects.
pub type EntityId = String;

/// Top-level project metadata. Persisted in the .entitysmith project file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectState {
    pub id: EntityId,
    pub name: String,
    pub version: u32,
    pub created_at: String,
    pub updated_at: String,
}

/// Describes a registered data source.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDescriptor {
    pub id: EntityId,
    pub project_id: EntityId,
    pub name: String,
    pub kind: SourceKind,
    pub path: Option<String>,
    /// Extensible JSON config blob. Empty for file-based sources in Phase 2;
    /// used for connection strings in Phase 2+ remote sources.
    pub config: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

/// Static capability metadata for a source kind.
/// Returned by `source_capabilities` IPC command so the frontend can
/// conditionally show/hide profile, sample, and enrichment affordances.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCapabilities {
    pub can_profile: bool,
    pub can_sample: bool,
    pub supports_schema_introspection: bool,
    pub supports_lazy_export: bool,
    pub supports_enrichment: bool,
}

impl SourceKind {
    pub fn capabilities(&self) -> SourceCapabilities {
        match self {
            SourceKind::SqliteFile => SourceCapabilities {
                can_profile: true,
                can_sample: true,
                supports_schema_introspection: true,
                supports_lazy_export: true,
                supports_enrichment: false,
            },
            SourceKind::JsonFile => SourceCapabilities {
                can_profile: true,
                can_sample: true,
                supports_schema_introspection: false,
                supports_lazy_export: false,
                supports_enrichment: false,
            },
            SourceKind::CsvFile => SourceCapabilities {
                can_profile: true,
                can_sample: true,
                supports_schema_introspection: false,
                supports_lazy_export: true,
                supports_enrichment: false,
            },
            SourceKind::MarkdownFolder => SourceCapabilities {
                can_profile: false,
                can_sample: false,
                supports_schema_introspection: false,
                supports_lazy_export: false,
                supports_enrichment: true,
            },
            SourceKind::PdfFile => SourceCapabilities {
                can_profile: false,
                can_sample: false,
                supports_schema_introspection: false,
                supports_lazy_export: false,
                supports_enrichment: true,
            },
            SourceKind::Url => SourceCapabilities {
                can_profile: false,
                can_sample: false,
                supports_schema_introspection: false,
                supports_lazy_export: false,
                supports_enrichment: true,
            },
            SourceKind::Postgres | SourceKind::Mysql => SourceCapabilities {
                can_profile: true,
                can_sample: true,
                supports_schema_introspection: true,
                supports_lazy_export: true,
                supports_enrichment: false,
            },
        }
    }

    /// Convert to the plain string stored in SQLite.
    pub fn to_db_str(&self) -> &'static str {
        match self {
            SourceKind::SqliteFile => "sqlite_file",
            SourceKind::JsonFile => "json_file",
            SourceKind::CsvFile => "csv_file",
            SourceKind::MarkdownFolder => "markdown_folder",
            SourceKind::PdfFile => "pdf_file",
            SourceKind::Url => "url",
            SourceKind::Postgres => "postgres",
            SourceKind::Mysql => "mysql",
        }
    }

    pub fn from_db_str(s: &str) -> Result<Self, String> {
        match s {
            "sqlite_file" => Ok(SourceKind::SqliteFile),
            "json_file" => Ok(SourceKind::JsonFile),
            "csv_file" => Ok(SourceKind::CsvFile),
            "markdown_folder" => Ok(SourceKind::MarkdownFolder),
            "pdf_file" => Ok(SourceKind::PdfFile),
            "url" => Ok(SourceKind::Url),
            "postgres" => Ok(SourceKind::Postgres),
            "mysql" => Ok(SourceKind::Mysql),
            _ => Err(format!("Unknown source kind: '{s}'")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceKind {
    SqliteFile,
    JsonFile,
    CsvFile,
    MarkdownFolder,
    PdfFile,
    Url,
    Postgres,
    Mysql,
}

// ── Profiling ─────────────────────────────────────────────────────────────────

/// A table / collection discovered within a source during profiling.
/// Kept flat (no nested IDs) because the schema graph (Phase 5) will promote
/// these into proper EntityType nodes. Here we just need stats for display.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceEntityProfile {
    pub source_id: EntityId,
    pub name: String,
    pub row_count: i64,
}

/// A column / field within a source entity, with statistical metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceAttributeProfile {
    pub name: String,
    pub inferred_type: String,
    pub is_nullable: bool,
    pub is_pk: bool,
    pub null_pct: f64,
    pub unique_pct: f64,
    pub min_value: Option<String>,
    pub max_value: Option<String>,
    pub top_values: Vec<TopValue>,
}

/// A single value + frequency entry in an attribute's value distribution.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopValue {
    pub value: String,
    pub count: i64,
}

/// A declared or inferred FK relationship found during profiling.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FkCandidate {
    pub source_id: EntityId,
    pub from_entity: String,
    pub from_column: String,
    pub to_entity: String,
    pub to_column: String,
    pub is_declared: bool,
}

/// Summary row returned immediately after profiling completes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceProfileSummary {
    pub source_id: EntityId,
    pub fingerprint: String,
    pub profiled_at: String,
    pub entity_count: i64,
}

/// Full profile returned by `get_source_profile` for UI display.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullSourceProfile {
    pub summary: SourceProfileSummary,
    pub entities: Vec<EntityWithAttributes>,
    pub fk_candidates: Vec<FkCandidate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityWithAttributes {
    pub profile: SourceEntityProfile,
    pub attributes: Vec<SourceAttributeProfile>,
}

// ── Schema Graph ──────────────────────────────────────────────────────────────

/// A canonical entity type in the schema graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityType {
    pub id: EntityId,
    pub project_id: EntityId,
    pub name: String,
    pub label: Option<String>,
    pub description: Option<String>,
    pub rdf_class: Option<String>,
    pub subject_column: Option<String>,
    pub created_at: String,
}

/// A relationship between two entity types.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Relationship {
    pub id: EntityId,
    pub project_id: EntityId,
    pub source_entity_type_id: EntityId,
    pub target_entity_type_id: EntityId,
    pub predicate: String,
    pub cardinality: Option<String>,
    pub created_at: String,
}

/// Binding between a canonical entity type and a source-local entity.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntitySourceBinding {
    pub id: EntityId,
    pub entity_type_id: EntityId,
    pub source_id: EntityId,
    pub entity_name: String,
    pub created_at: String,
}

/// EntityType enriched with its source bindings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityTypeWithBindings {
    pub entity_type: EntityType,
    pub bindings: Vec<EntitySourceBinding>,
}

/// Full schema graph snapshot returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaGraph {
    pub entity_types: Vec<EntityTypeWithBindings>,
    pub relationships: Vec<Relationship>,
}

/// One row in the Entity Catalog — a source-local entity with proposal stats.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceEntitySummary {
    pub source_id: EntityId,
    pub source_name: String,
    pub entity_name: String,
    pub row_count: i64,
    /// Number of accepted/pending proposals that reference this entity
    pub proposal_count: i64,
    /// Highest confidence score among proposals referencing this entity
    pub max_similarity: f64,
    /// Entity type this source entity is already bound to (if any)
    pub bound_entity_type_id: Option<EntityId>,
    pub bound_entity_type_name: Option<String>,
}

/// One piece of evidence supporting a connection proposal.
/// A proposal can have multiple reasons — one per detection method that fired.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalReason {
    pub kind: ProposalKind,
    pub origin: ProposalOrigin,
    /// Confidence contributed by this specific detection method (0.0–1.0).
    pub confidence: f64,
    /// Method-specific evidence blob (overlap counts, similarity scores, etc.)
    pub evidence: serde_json::Value,
}

/// A connection proposal between two source entities.
///
/// One proposal = one unique (from_source, from_entity, from_col,
///                            to_source,   to_entity,   to_col) endpoint pair.
///
/// Multiple detection methods that fire for the same endpoint pair accumulate
/// as separate `reasons` entries rather than separate proposals.
/// The top-level `confidence` is the combined score across all reasons.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Proposal {
    pub id: EntityId,
    pub project_id: EntityId,
    pub status: ProposalStatus,
    /// Combined confidence across all reasons (independent-evidence formula).
    pub confidence: f64,
    // Connection endpoints
    pub from_source_id: EntityId,
    pub from_entity: String,
    pub from_column: String,
    pub to_source_id: EntityId,
    pub to_entity: String,
    pub to_column: String,
    // Suggested relationship (system-generated defaults)
    pub suggested_predicate: String,
    pub suggested_cardinality: String,
    // User modifications (populated when status = Modified)
    pub reviewed_predicate: Option<String>,
    pub reviewed_cardinality: Option<String>,
    /// All detection reasons that support this proposal (sorted by confidence desc).
    pub reasons: Vec<ProposalReason>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProposalKind {
    ForeignKey,
    SoftForeignKey,
    ColumnNameSimilarity,
    SampleValueOverlap,
    EmbeddingSimilarity,
    LlmReasoning,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProposalStatus {
    Pending,
    Accepted,
    Rejected,
    Modified,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProposalOrigin {
    DeclaredFk,
    Heuristic,
    Embedding,
    Llm,
}

impl ProposalKind {
    pub fn to_db_str(&self) -> &'static str {
        match self {
            ProposalKind::ForeignKey => "foreign_key",
            ProposalKind::SoftForeignKey => "soft_foreign_key",
            ProposalKind::ColumnNameSimilarity => "column_name_similarity",
            ProposalKind::SampleValueOverlap => "sample_value_overlap",
            ProposalKind::EmbeddingSimilarity => "embedding_similarity",
            ProposalKind::LlmReasoning => "llm_reasoning",
        }
    }
    pub fn from_db_str(s: &str) -> Self {
        match s {
            "foreign_key" => ProposalKind::ForeignKey,
            "soft_foreign_key" => ProposalKind::SoftForeignKey,
            "column_name_similarity" => ProposalKind::ColumnNameSimilarity,
            "sample_value_overlap" => ProposalKind::SampleValueOverlap,
            "embedding_similarity" => ProposalKind::EmbeddingSimilarity,
            _ => ProposalKind::LlmReasoning,
        }
    }
}

impl ProposalStatus {
    pub fn to_db_str(&self) -> &'static str {
        match self {
            ProposalStatus::Pending => "pending",
            ProposalStatus::Accepted => "accepted",
            ProposalStatus::Rejected => "rejected",
            ProposalStatus::Modified => "modified",
        }
    }
    pub fn from_db_str(s: &str) -> Self {
        match s {
            "accepted" => ProposalStatus::Accepted,
            "rejected" => ProposalStatus::Rejected,
            "modified" => ProposalStatus::Modified,
            _ => ProposalStatus::Pending,
        }
    }
}

impl ProposalOrigin {
    pub fn to_db_str(&self) -> &'static str {
        match self {
            ProposalOrigin::DeclaredFk => "declared_fk",
            ProposalOrigin::Heuristic => "heuristic",
            ProposalOrigin::Embedding => "embedding",
            ProposalOrigin::Llm => "llm",
        }
    }
    pub fn from_db_str(s: &str) -> Self {
        match s {
            "declared_fk" => ProposalOrigin::DeclaredFk,
            "embedding" => ProposalOrigin::Embedding,
            "llm" => ProposalOrigin::Llm,
            _ => ProposalOrigin::Heuristic,
        }
    }
}

/// Provenance record attached to decisions and proposals.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvenanceRecord {
    pub id: EntityId,
    pub object_id: EntityId,
    pub object_kind: String,
    pub action: String,
    pub actor: String,
    pub detail: serde_json::Value,
    pub created_at: String,
}

/// Tracks the lifecycle of a background job.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobStatus {
    pub id: EntityId,
    pub kind: String,
    pub status: JobState,
    pub progress: Option<f64>,
    pub message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobState {
    Queued,
    Running,
    Completed,
    Failed,
    Canceled,
}

/// A validation issue found during graph validation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub id: EntityId,
    pub kind: ValidationKind,
    pub message: String,
    pub object_id: Option<EntityId>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ValidationKind {
    Error,
    Warning,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportFormat {
    Turtle,
    JsonLd,
    GraphMl,
    Mermaid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UriStrategy {
    UuidV4,
    UlidBased,
    ColumnBased { column: String, prefix: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictPolicy {
    PreferSourceA,
    PreferSourceB,
    PreferNonNull,
    PreferMostRecent,
    KeepBoth,
}

// ── Consolidation (Phase 7 / Stage 4) ────────────────────────────────────────

/// Type of consolidation decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConsolidationDecisionType {
    Merge,
    Link,
    Subtype,
    KeepSeparate,
}

impl ConsolidationDecisionType {
    pub fn to_db_str(&self) -> &'static str {
        match self {
            Self::Merge => "merge",
            Self::Link => "link",
            Self::Subtype => "subtype",
            Self::KeepSeparate => "keep_separate",
        }
    }
    pub fn from_db_str(s: &str) -> Self {
        match s {
            "merge" => Self::Merge,
            "link" => Self::Link,
            "subtype" => Self::Subtype,
            _ => Self::KeepSeparate,
        }
    }
}

/// A consolidation decision: merge, link, subtype, or keep-separate for a pair
/// of source entities.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsolidationDecision {
    pub id: EntityId,
    pub project_id: EntityId,
    pub decision_type: ConsolidationDecisionType,
    pub entity_a_source_id: EntityId,
    pub entity_a_name: String,
    pub entity_b_source_id: EntityId,
    pub entity_b_name: String,
    pub result_entity_type_id: Option<EntityId>,
    pub result_relationship_id: Option<EntityId>,
    pub parent_entity_type_id: Option<EntityId>,
    pub child_entity_type_id: Option<EntityId>,
    pub config: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

/// A pairwise similarity score between two source entities.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntitySimilarityPair {
    pub id: EntityId,
    pub project_id: EntityId,
    pub entity_a_source_id: EntityId,
    pub entity_a_name: String,
    pub entity_b_source_id: EntityId,
    pub entity_b_name: String,
    pub similarity_score: f64,
    pub scoring_details: serde_json::Value,
    pub status: String,
    pub created_at: String,
}

/// Per-entity-type attribute mapping: source column → canonical name → RDF predicate.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttributeMapping {
    pub id: EntityId,
    pub entity_type_id: EntityId,
    pub source_id: EntityId,
    pub source_column: String,
    pub canonical_name: String,
    pub rdf_predicate: Option<String>,
    pub xsd_datatype: Option<String>,
    pub is_omitted: bool,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// How two attributes from different source entities align.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AttributeMatchType {
    Exact,
    Inferred,
    UnmatchedA,
    UnmatchedB,
}

/// A single alignment row in the comparison panel.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttributeAlignment {
    pub source_a_column: Option<String>,
    pub source_a_type: Option<String>,
    pub source_b_column: Option<String>,
    pub source_b_type: Option<String>,
    pub match_type: AttributeMatchType,
    pub confidence: f64,
}

/// Full comparison data for the side-by-side panel.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityComparisonData {
    pub entity_a: EntityWithAttributes,
    pub entity_b: EntityWithAttributes,
    pub attribute_alignments: Vec<AttributeAlignment>,
    pub similarity_score: f64,
    pub scoring_details: serde_json::Value,
}
