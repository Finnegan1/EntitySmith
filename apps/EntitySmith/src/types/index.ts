// Core EntitySmith domain types — mirrors the Rust domain model in src-tauri/src/domain/mod.rs.
// These are the canonical naming conventions used across the entire frontend.

export type EntityId = string;

// ── Project ──────────────────────────────────────────────────────────────────

export interface ProjectState {
  id: EntityId;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ── Sources ───────────────────────────────────────────────────────────────────

export type SourceKind =
  | "sqlite_file"
  | "json_file"
  | "csv_file"
  | "markdown_folder"
  | "pdf_file"
  | "url"
  | "postgres"
  | "mysql";

export interface SourceDescriptor {
  id: EntityId;
  projectId: EntityId;
  name: string;
  kind: SourceKind;
  path?: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SourceCapabilities {
  canProfile: boolean;
  canSample: boolean;
  supportsSchemaIntrospection: boolean;
  supportsLazyExport: boolean;
  supportsEnrichment: boolean;
}

// ── Profiling ─────────────────────────────────────────────────────────────────

export interface TopValue {
  value: string;
  count: number;
}

export interface SourceAttributeProfile {
  name: string;
  inferredType: string;
  isNullable: boolean;
  isPk: boolean;
  nullPct: number;
  uniquePct: number;
  minValue?: string;
  maxValue?: string;
  topValues: TopValue[];
}

export interface SourceEntityProfile {
  sourceId: EntityId;
  name: string;
  rowCount: number;
}

export interface EntityWithAttributes {
  profile: SourceEntityProfile;
  attributes: SourceAttributeProfile[];
}

export interface FkCandidate {
  sourceId: EntityId;
  fromEntity: string;
  fromColumn: string;
  toEntity: string;
  toColumn: string;
  isDeclared: boolean;
}

export interface SourceProfileSummary {
  sourceId: EntityId;
  fingerprint: string;
  profiledAt: string;
  entityCount: number;
}

export interface FullSourceProfile {
  summary: SourceProfileSummary;
  entities: EntityWithAttributes[];
  fkCandidates: FkCandidate[];
}

// ── Schema Graph ──────────────────────────────────────────────────────────────

export interface EntityType {
  id: EntityId;
  projectId: EntityId;
  name: string;
  label?: string;
  description?: string;
  rdfClass?: string;
  subjectColumn?: string;
  createdAt: string;
}

export interface Relationship {
  id: EntityId;
  projectId: EntityId;
  sourceEntityTypeId: EntityId;
  targetEntityTypeId: EntityId;
  predicate: string;
  cardinality?: string;
  createdAt: string;
}

// ── Proposals ─────────────────────────────────────────────────────────────────

export type ProposalKind =
  | "foreign_key"
  | "soft_foreign_key"
  | "column_name_similarity"
  | "sample_value_overlap"
  | "embedding_similarity"
  | "llm_reasoning";

export type ProposalStatus = "pending" | "accepted" | "rejected" | "modified";

export type ProposalOrigin = "declared_fk" | "heuristic" | "embedding" | "llm";

export type ReviewAction = "accept" | "reject" | "modify";

/** One piece of evidence from a single detection method. */
export interface ProposalReason {
  kind: ProposalKind;
  origin: ProposalOrigin;
  /** Confidence contributed by this specific method (0–1). */
  confidence: number;
  /** Method-specific evidence blob. */
  evidence: Record<string, unknown>;
}

/**
 * One proposal per unique connection endpoint pair.
 * All detection methods that fire for the same pair are stored as `reasons`.
 * `confidence` is the combined score across all reasons.
 */
export interface Proposal {
  id: EntityId;
  projectId: EntityId;
  status: ProposalStatus;
  /** Combined confidence: 1 − Π(1 − cᵢ) across all reasons. */
  confidence: number;
  // Connection endpoints
  fromSourceId: EntityId;
  fromEntity: string;
  fromColumn: string;
  toSourceId: EntityId;
  toEntity: string;
  toColumn: string;
  // Relationship
  suggestedPredicate: string;
  suggestedCardinality: string;
  reviewedPredicate?: string;
  reviewedCardinality?: string;
  /** All detection reasons, sorted by confidence desc. */
  reasons: ProposalReason[];
  createdAt: string;
  updatedAt: string;
}

// ── Provenance ────────────────────────────────────────────────────────────────

export interface ProvenanceRecord {
  id: EntityId;
  objectId: EntityId;
  objectKind: string;
  action: string;
  actor: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export type JobState =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export interface JobStatus {
  id: EntityId;
  kind: string;
  status: JobState;
  progress?: number;
  message?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Validation & Export ───────────────────────────────────────────────────────

export type ValidationKind = "error" | "warning";

export interface ValidationIssue {
  id: EntityId;
  kind: ValidationKind;
  message: string;
  objectId?: EntityId;
}

export type ExportFormat = "turtle" | "json_ld" | "graph_ml" | "mermaid";

export type UriStrategy =
  | { type: "uuid_v4" }
  | { type: "ulid_based" }
  | { type: "column_based"; column: string; prefix: string };

export type ConflictPolicy =
  | "prefer_source_a"
  | "prefer_source_b"
  | "prefer_non_null"
  | "prefer_most_recent"
  | "keep_both";

// ── Schema Graph (Phase 5 additions) ─────────────────────────────────────────

export interface EntitySourceBinding {
  id: EntityId;
  entityTypeId: EntityId;
  sourceId: EntityId;
  entityName: string;
  createdAt: string;
}

export interface EntityTypeWithBindings {
  entityType: EntityType;
  bindings: EntitySourceBinding[];
}

export interface SchemaGraph {
  entityTypes: EntityTypeWithBindings[];
  relationships: Relationship[];
}

export interface SourceEntitySummary {
  sourceId: EntityId;
  sourceName: string;
  entityName: string;
  rowCount: number;
  proposalCount: number;
  maxSimilarity: number;
  boundEntityTypeId?: EntityId;
  boundEntityTypeName?: string;
}

// ── View / Navigation ─────────────────────────────────────────────────────────

export type AppView =
  | "project"
  | "sources"
  | "schema-graph"
  | "proposals"
  | "consolidation"
  | "identity"
  | "export"
  | "settings";

// ── Consolidation (Phase 7 / Stage 4) ────────────────────────────────────────

export type ConsolidationDecisionType = "merge" | "link" | "subtype" | "keep_separate";

export interface ConsolidationDecision {
  id: EntityId;
  projectId: EntityId;
  decisionType: ConsolidationDecisionType;
  entityASourceId: EntityId;
  entityAName: string;
  entityBSourceId: EntityId;
  entityBName: string;
  resultEntityTypeId?: EntityId;
  resultRelationshipId?: EntityId;
  parentEntityTypeId?: EntityId;
  childEntityTypeId?: EntityId;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EntitySimilarityPair {
  id: EntityId;
  projectId: EntityId;
  entityASourceId: EntityId;
  entityAName: string;
  entityBSourceId: EntityId;
  entityBName: string;
  similarityScore: number;
  scoringDetails: Record<string, unknown>;
  status: string;
  createdAt: string;
}

export type AttributeMatchType = "exact" | "inferred" | "unmatched_a" | "unmatched_b";

export interface AttributeAlignment {
  sourceAColumn?: string;
  sourceAType?: string;
  sourceBColumn?: string;
  sourceBType?: string;
  matchType: AttributeMatchType;
  confidence: number;
}

export interface EntityComparisonData {
  entityA: EntityWithAttributes;
  entityB: EntityWithAttributes;
  attributeAlignments: AttributeAlignment[];
  similarityScore: number;
  scoringDetails: Record<string, unknown>;
}

export interface AttributeMapping {
  id: EntityId;
  entityTypeId: EntityId;
  sourceId: EntityId;
  sourceColumn: string;
  canonicalName: string;
  rdfPredicate?: string;
  xsdDatatype?: string;
  isOmitted: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
