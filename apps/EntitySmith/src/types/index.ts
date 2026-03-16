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

export interface Proposal {
  id: EntityId;
  projectId: EntityId;
  kind: ProposalKind;
  status: ProposalStatus;
  confidence: number;
  origin: ProposalOrigin;
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
  // Method-specific evidence
  evidence: Record<string, unknown>;
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

// ── View / Navigation ─────────────────────────────────────────────────────────

export type AppView =
  | "project"
  | "sources"
  | "schema-graph"
  | "proposals"
  | "identity"
  | "export"
  | "settings";
