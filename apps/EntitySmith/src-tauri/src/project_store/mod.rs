use std::path::{Path, PathBuf};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, params};
use uuid::Uuid;

use crate::domain::{
    AttributeAlignment, AttributeMapping, AttributeMatchType,
    ConsolidationDecision, ConsolidationDecisionType,
    EntityComparisonData, EntitySimilarityPair,
    EntitySourceBinding, EntityType, EntityTypeWithBindings,
    EntityWithAttributes, FkCandidate, FullSourceProfile, ProjectState, Proposal,
    ProposalKind, ProposalReason, ProposalStatus, ProposalOrigin,
    Relationship, SchemaGraph,
    SourceAttributeProfile, SourceDescriptor, SourceEntityProfile,
    SourceEntitySummary, SourceKind, SourceProfileSummary, TopValue,
};
use crate::adapters::AdapterProfileResult;

// ── Schema ────────────────────────────────────────────────────────────────────

const SCHEMA_V1: &str = "
CREATE TABLE IF NOT EXISTS _meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project (
    id         TEXT PRIMARY KEY NOT NULL,
    name       TEXT NOT NULL,
    version    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS change_log (
    id              TEXT PRIMARY KEY NOT NULL,
    sequence        INTEGER NOT NULL,
    operation       TEXT NOT NULL,
    object_kind     TEXT NOT NULL,
    object_id       TEXT NOT NULL,
    forward_payload TEXT NOT NULL,
    reverse_payload TEXT NOT NULL,
    created_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS change_log_sequence ON change_log(sequence);
";

const SCHEMA_V2: &str = "
CREATE TABLE IF NOT EXISTS sources (
    id         TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES project(id),
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL,
    path       TEXT,
    config     TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sources_project_id ON sources(project_id);
";

const SCHEMA_V3: &str = "
CREATE TABLE IF NOT EXISTS source_fingerprints (
    source_id    TEXT PRIMARY KEY NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    fingerprint  TEXT NOT NULL,
    profiled_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_entities (
    id          TEXT PRIMARY KEY NOT NULL,
    source_id   TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    row_count   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS source_entities_source_id ON source_entities(source_id);

CREATE TABLE IF NOT EXISTS source_attributes (
    id             TEXT PRIMARY KEY NOT NULL,
    entity_id      TEXT NOT NULL REFERENCES source_entities(id) ON DELETE CASCADE,
    source_id      TEXT NOT NULL,
    name           TEXT NOT NULL,
    inferred_type  TEXT NOT NULL DEFAULT 'text',
    is_nullable    INTEGER NOT NULL DEFAULT 1,
    is_pk          INTEGER NOT NULL DEFAULT 0,
    null_pct       REAL NOT NULL DEFAULT 0.0,
    unique_pct     REAL NOT NULL DEFAULT 0.0,
    min_value      TEXT,
    max_value      TEXT,
    top_values     TEXT NOT NULL DEFAULT '[]',
    created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS source_attributes_entity_id ON source_attributes(entity_id);

CREATE TABLE IF NOT EXISTS source_fk_candidates (
    id             TEXT PRIMARY KEY NOT NULL,
    source_id      TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    from_entity    TEXT NOT NULL,
    from_column    TEXT NOT NULL,
    to_entity      TEXT NOT NULL,
    to_column      TEXT NOT NULL,
    is_declared    INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS source_fk_candidates_source_id ON source_fk_candidates(source_id);
";

const SCHEMA_V4: &str = "
CREATE TABLE IF NOT EXISTS proposals (
    id                    TEXT PRIMARY KEY NOT NULL,
    project_id            TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    kind                  TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'pending',
    confidence            REAL NOT NULL,
    origin                TEXT NOT NULL,
    from_source_id        TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    from_entity           TEXT NOT NULL,
    from_column           TEXT NOT NULL,
    to_source_id          TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    to_entity             TEXT NOT NULL,
    to_column             TEXT NOT NULL,
    suggested_predicate   TEXT NOT NULL,
    suggested_cardinality TEXT NOT NULL DEFAULT 'unknown',
    reviewed_predicate    TEXT,
    reviewed_cardinality  TEXT,
    evidence              TEXT NOT NULL DEFAULT '{}',
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS proposals_project_id ON proposals(project_id);
CREATE INDEX IF NOT EXISTS proposals_status ON proposals(status);
";

const SCHEMA_V5: &str = "
CREATE TABLE IF NOT EXISTS entity_types (
    id          TEXT PRIMARY KEY NOT NULL,
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    label       TEXT,
    description TEXT,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entity_types_project_id ON entity_types(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS entity_types_name ON entity_types(project_id, name);

CREATE TABLE IF NOT EXISTS entity_source_bindings (
    id               TEXT PRIMARY KEY NOT NULL,
    entity_type_id   TEXT NOT NULL REFERENCES entity_types(id) ON DELETE CASCADE,
    source_id        TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    entity_name      TEXT NOT NULL,
    created_at       TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS entity_source_bindings_unique ON entity_source_bindings(entity_type_id, source_id, entity_name);

CREATE TABLE IF NOT EXISTS relationships (
    id                     TEXT PRIMARY KEY NOT NULL,
    project_id             TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    source_entity_type_id  TEXT NOT NULL REFERENCES entity_types(id) ON DELETE CASCADE,
    target_entity_type_id  TEXT NOT NULL REFERENCES entity_types(id) ON DELETE CASCADE,
    predicate              TEXT NOT NULL,
    cardinality            TEXT,
    created_at             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS relationships_project_id ON relationships(project_id);
";

const SCHEMA_V6: &str = "
-- Refactor: proposals no longer store kind/origin/evidence directly.
-- Each detection method becomes a 'reason' row with its own kind/origin/confidence/evidence.

CREATE TABLE IF NOT EXISTS proposal_reasons (
    id           TEXT PRIMARY KEY NOT NULL,
    proposal_id  TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL,
    origin       TEXT NOT NULL,
    confidence   REAL NOT NULL,
    evidence     TEXT NOT NULL DEFAULT '{}',
    created_at   TEXT NOT NULL,
    UNIQUE(proposal_id, kind)
);
CREATE INDEX IF NOT EXISTS proposal_reasons_proposal_id ON proposal_reasons(proposal_id);

-- Migrate existing proposal rows into reasons.
-- Use proposal.id || '-r' as a deterministic, unique reason id.
INSERT OR IGNORE INTO proposal_reasons (id, proposal_id, kind, origin, confidence, evidence, created_at)
SELECT id || '-r', id, kind, origin, confidence, evidence, created_at FROM proposals;

-- Recreate the proposals table without the now-redundant kind/origin/evidence columns.
DROP TABLE IF EXISTS proposals_new;
CREATE TABLE proposals_new (
    id                    TEXT PRIMARY KEY NOT NULL,
    project_id            TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    status                TEXT NOT NULL DEFAULT 'pending',
    confidence            REAL NOT NULL,
    from_source_id        TEXT NOT NULL,
    from_entity           TEXT NOT NULL,
    from_column           TEXT NOT NULL,
    to_source_id          TEXT NOT NULL,
    to_entity             TEXT NOT NULL,
    to_column             TEXT NOT NULL,
    suggested_predicate   TEXT NOT NULL,
    suggested_cardinality TEXT NOT NULL DEFAULT 'unknown',
    reviewed_predicate    TEXT,
    reviewed_cardinality  TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
);
INSERT INTO proposals_new
    SELECT id, project_id, status, confidence,
           from_source_id, from_entity, from_column,
           to_source_id, to_entity, to_column,
           suggested_predicate, suggested_cardinality,
           reviewed_predicate, reviewed_cardinality,
           created_at, updated_at
    FROM proposals;
DROP TABLE proposals;
ALTER TABLE proposals_new RENAME TO proposals;
CREATE INDEX IF NOT EXISTS proposals_project_id ON proposals(project_id);
CREATE INDEX IF NOT EXISTS proposals_status ON proposals(status);
";

const SCHEMA_V7: &str = "
-- Pairwise similarity scores between source entities (Stage 4).
CREATE TABLE IF NOT EXISTS entity_similarity_pairs (
    id                 TEXT PRIMARY KEY NOT NULL,
    project_id         TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    entity_a_source_id TEXT NOT NULL,
    entity_a_name      TEXT NOT NULL,
    entity_b_source_id TEXT NOT NULL,
    entity_b_name      TEXT NOT NULL,
    similarity_score   REAL NOT NULL,
    scoring_details    TEXT NOT NULL DEFAULT '{}',
    status             TEXT NOT NULL DEFAULT 'pending',
    created_at         TEXT NOT NULL,
    UNIQUE(project_id, entity_a_source_id, entity_a_name, entity_b_source_id, entity_b_name)
);
CREATE INDEX IF NOT EXISTS entity_similarity_project ON entity_similarity_pairs(project_id);

-- Consolidation decisions: merge / link / subtype / keep_separate.
CREATE TABLE IF NOT EXISTS consolidation_decisions (
    id                      TEXT PRIMARY KEY NOT NULL,
    project_id              TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    decision_type           TEXT NOT NULL,
    entity_a_source_id      TEXT NOT NULL,
    entity_a_name           TEXT NOT NULL,
    entity_b_source_id      TEXT NOT NULL,
    entity_b_name           TEXT NOT NULL,
    result_entity_type_id   TEXT,
    result_relationship_id  TEXT,
    parent_entity_type_id   TEXT,
    child_entity_type_id    TEXT,
    config                  TEXT NOT NULL DEFAULT '{}',
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS consolidation_decisions_project ON consolidation_decisions(project_id);

-- Per-entity-type attribute mappings (source columns → RDF predicates).
CREATE TABLE IF NOT EXISTS attribute_mappings (
    id              TEXT PRIMARY KEY NOT NULL,
    entity_type_id  TEXT NOT NULL REFERENCES entity_types(id) ON DELETE CASCADE,
    source_id       TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    source_column   TEXT NOT NULL,
    canonical_name  TEXT NOT NULL,
    rdf_predicate   TEXT,
    xsd_datatype    TEXT,
    is_omitted      INTEGER NOT NULL DEFAULT 0,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    UNIQUE(entity_type_id, source_id, source_column)
);
CREATE INDEX IF NOT EXISTS attribute_mappings_entity_type ON attribute_mappings(entity_type_id);
";

// V7 also needs to add columns to entity_types.
// SQLite ALTER TABLE only supports ADD COLUMN one at a time; we use a helper.
const SCHEMA_V7_ALTER: &str = "
ALTER TABLE entity_types ADD COLUMN rdf_class TEXT;
ALTER TABLE entity_types ADD COLUMN subject_column TEXT;
";

const CURRENT_SCHEMA_VERSION: u32 = 7;

// ── ProjectStore ──────────────────────────────────────────────────────────────

/// Wraps a rusqlite Connection to the .entitysmith project file.
///
/// This type is NOT Send on its own — it must always live inside a
/// `Mutex` (see `AppState` in lib.rs). The Mutex is the sync boundary;
/// the Connection is only accessed while the lock is held.
pub struct ProjectStore {
    conn: Connection,
    pub path: PathBuf,
}

impl ProjectStore {
    /// Create a new .entitysmith project file at `path` with the given `name`.
    ///
    /// Returns `Err` if the file already exists or if the path is not writable.
    pub fn create(path: impl AsRef<Path>, name: &str) -> Result<Self, String> {
        let path = path.as_ref().to_path_buf();

        if path.exists() {
            return Err(format!(
                "A file already exists at {}",
                path.display()
            ));
        }

        let conn = Connection::open(&path)
            .map_err(|e| format!("Failed to create project file: {e}"))?;

        Self::apply_migrations(&conn)?;

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO project (id, name, version, created_at, updated_at)
             VALUES (?1, ?2, 1, ?3, ?4)",
            params![id, name, now, now],
        )
        .map_err(|e| format!("Failed to write project record: {e}"))?;

        let store = Self { conn, path };

        // Log the creation event.
        let project_state = store.get_project_state()?;
        let payload = serde_json::to_string(&project_state)
            .unwrap_or_else(|_| "{}".to_string());
        store.log_change(
            "create_project",
            "project",
            &project_state.id,
            &payload,
            "{}",
        )?;

        Ok(store)
    }

    /// Open an existing .entitysmith project file.
    ///
    /// Returns `Err` if the file does not exist, is not readable, or is not a
    /// valid EntitySmith project.
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let path = path.as_ref().to_path_buf();

        if !path.exists() {
            return Err(format!("Project file not found: {}", path.display()));
        }

        let conn = Connection::open(&path)
            .map_err(|e| format!("Failed to open project file: {e}"))?;

        // Validate that this is actually an EntitySmith project.
        let is_valid: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master
                 WHERE type='table' AND name='project'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map(|n| n > 0)
            .unwrap_or(false);

        if !is_valid {
            return Err("This file is not a valid EntitySmith project.".to_string());
        }

        Self::apply_migrations(&conn)?;

        Ok(Self { conn, path })
    }

    /// Returns the current project metadata from the `project` table.
    pub fn get_project_state(&self) -> Result<ProjectState, String> {
        self.conn
            .query_row(
                "SELECT id, name, version, created_at, updated_at FROM project LIMIT 1",
                [],
                |row| {
                    Ok(ProjectState {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        version: row.get::<_, u32>(2)?,
                        created_at: row.get(3)?,
                        updated_at: row.get(4)?,
                    })
                },
            )
            .map_err(|e| format!("Failed to read project state: {e}"))
    }

    /// Write a change_log entry. Called after every mutating operation.
    ///
    /// `forward_payload`: JSON representing the new state (what was applied).
    /// `reverse_payload`: JSON representing how to undo this change (`"{}"` if
    ///                    the operation is not reversible, e.g. project creation).
    pub fn log_change(
        &self,
        operation: &str,
        object_kind: &str,
        object_id: &str,
        forward_payload: &str,
        reverse_payload: &str,
    ) -> Result<(), String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        // Compute next sequence number inside the same connection.
        let sequence: i64 = self
            .conn
            .query_row(
                "SELECT COALESCE(MAX(sequence), 0) + 1 FROM change_log",
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to compute sequence: {e}"))?;

        self.conn
            .execute(
                "INSERT INTO change_log
                 (id, sequence, operation, object_kind, object_id,
                  forward_payload, reverse_payload, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    id,
                    sequence,
                    operation,
                    object_kind,
                    object_id,
                    forward_payload,
                    reverse_payload,
                    now
                ],
            )
            .map_err(|e| format!("Failed to write change log: {e}"))?;

        Ok(())
    }

    /// Returns the filesystem path of this project file.
    pub fn path(&self) -> &Path {
        &self.path
    }

    // ── Source CRUD ───────────────────────────────────────────────────────────

    /// Register a new source in the project.
    pub fn add_source(
        &self,
        name: &str,
        kind: &SourceKind,
        path: Option<&str>,
        config: &str,
    ) -> Result<SourceDescriptor, String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        let project_id = self.get_project_state()?.id;

        self.conn
            .execute(
                "INSERT INTO sources (id, project_id, name, kind, path, config, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![id, project_id, name, kind.to_db_str(), path, config, now, now],
            )
            .map_err(|e| format!("Failed to insert source: {e}"))?;

        let descriptor = self.get_source(&id)?;

        let payload = serde_json::to_string(&descriptor)
            .unwrap_or_else(|_| "{}".to_string());
        self.log_change("add_source", "source", &id, &payload, "{}")?;

        Ok(descriptor)
    }

    /// Remove a source from the project by ID.
    pub fn remove_source(&self, source_id: &str) -> Result<(), String> {
        let descriptor = self.get_source(source_id)?;
        let reverse_payload = serde_json::to_string(&descriptor)
            .unwrap_or_else(|_| "{}".to_string());

        let affected = self.conn
            .execute("DELETE FROM sources WHERE id = ?1", params![source_id])
            .map_err(|e| format!("Failed to delete source: {e}"))?;

        if affected == 0 {
            return Err(format!("Source '{source_id}' not found."));
        }

        self.log_change("remove_source", "source", source_id, "{}", &reverse_payload)?;

        Ok(())
    }

    /// Return all sources for the current project, ordered by creation time.
    pub fn list_sources(&self) -> Result<Vec<SourceDescriptor>, String> {
        let project_id = self.get_project_state()?.id;

        let mut stmt = self.conn
            .prepare(
                "SELECT id, project_id, name, kind, path, config, created_at, updated_at
                 FROM sources WHERE project_id = ?1 ORDER BY created_at ASC",
            )
            .map_err(|e| format!("Failed to prepare sources query: {e}"))?;

        let rows = stmt
            .query_map(params![project_id], |row| {
                let kind_str: String = row.get(3)?;
                let config_str: String = row.get(5)?;
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    kind_str,
                    row.get::<_, Option<String>>(4)?,
                    config_str,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                ))
            })
            .map_err(|e| format!("Failed to query sources: {e}"))?;

        let mut sources = Vec::new();
        for row in rows {
            let (id, project_id, name, kind_str, path, config_str, created_at, updated_at) =
                row.map_err(|e| format!("Failed to read source row: {e}"))?;

            let kind = SourceKind::from_db_str(&kind_str)?;
            let config: serde_json::Value =
                serde_json::from_str(&config_str).unwrap_or(serde_json::Value::Object(Default::default()));

            sources.push(SourceDescriptor {
                id,
                project_id,
                name,
                kind,
                path,
                config,
                created_at,
                updated_at,
            });
        }

        Ok(sources)
    }

    // ── Profile CRUD ──────────────────────────────────────────────────────────

    /// Persist a full adapter profile result for one source.
    ///
    /// This replaces any previously stored profile for the source — all old
    /// entities, attributes, and FK candidates are deleted before writing the
    /// new data.
    pub fn save_source_profile(
        &self,
        source_id: &str,
        fingerprint: &str,
        result: &AdapterProfileResult,
    ) -> Result<(), String> {
        let now = Utc::now().to_rfc3339();

        // Delete stale data (cascade handles child rows).
        self.conn.execute(
            "DELETE FROM source_fingerprints WHERE source_id = ?1",
            params![source_id],
        ).map_err(|e| format!("Failed to delete old fingerprint: {e}"))?;
        self.conn.execute(
            "DELETE FROM source_entities WHERE source_id = ?1",
            params![source_id],
        ).map_err(|e| format!("Failed to delete old entities: {e}"))?;
        self.conn.execute(
            "DELETE FROM source_fk_candidates WHERE source_id = ?1",
            params![source_id],
        ).map_err(|e| format!("Failed to delete old FK candidates: {e}"))?;

        // Insert new fingerprint record.
        self.conn.execute(
            "INSERT INTO source_fingerprints (source_id, fingerprint, profiled_at)
             VALUES (?1, ?2, ?3)",
            params![source_id, fingerprint, now],
        ).map_err(|e| format!("Failed to insert fingerprint: {e}"))?;

        for entity in &result.entities {
            let entity_id = Uuid::new_v4().to_string();

            self.conn.execute(
                "INSERT INTO source_entities (id, source_id, name, row_count, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![entity_id, source_id, entity.name, entity.row_count, now],
            ).map_err(|e| format!("Failed to insert entity '{}': {e}", entity.name))?;

            for attr in &entity.attributes {
                let attr_id = Uuid::new_v4().to_string();
                let top_json = serde_json::to_string(&attr.top_values.iter().map(|tv| {
                    serde_json::json!({ "value": tv.value, "count": tv.count })
                }).collect::<Vec<_>>()).unwrap_or_else(|_| "[]".to_string());

                self.conn.execute(
                    "INSERT INTO source_attributes
                     (id, entity_id, source_id, name, inferred_type, is_nullable, is_pk,
                      null_pct, unique_pct, min_value, max_value, top_values, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                    params![
                        attr_id, entity_id, source_id, attr.name,
                        attr.inferred_type,
                        attr.is_nullable as i32,
                        attr.is_pk as i32,
                        attr.null_pct, attr.unique_pct,
                        attr.min_value, attr.max_value,
                        top_json, now
                    ],
                ).map_err(|e| format!("Failed to insert attribute '{}': {e}", attr.name))?;
            }

            for fk in &entity.declared_fks {
                let fk_id = Uuid::new_v4().to_string();
                self.conn.execute(
                    "INSERT INTO source_fk_candidates
                     (id, source_id, from_entity, from_column, to_entity, to_column,
                      is_declared, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)",
                    params![
                        fk_id, source_id, entity.name, fk.from_column,
                        fk.to_table, fk.to_column, now
                    ],
                ).map_err(|e| format!("Failed to insert FK candidate: {e}"))?;
            }
        }

        Ok(())
    }

    /// Return the stored profile summary for a source, if any.
    pub fn get_source_profile_summary(
        &self,
        source_id: &str,
    ) -> Result<Option<SourceProfileSummary>, String> {
        let fp_row: Option<(String, String)> = self.conn
            .query_row(
                "SELECT fingerprint, profiled_at FROM source_fingerprints WHERE source_id = ?1",
                params![source_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|e| format!("Failed to read fingerprint: {e}"))?;

        let (fingerprint, profiled_at) = match fp_row {
            None => return Ok(None),
            Some(t) => t,
        };

        let entity_count: i64 = self.conn
            .query_row(
                "SELECT COUNT(*) FROM source_entities WHERE source_id = ?1",
                params![source_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to count entities: {e}"))?;

        Ok(Some(SourceProfileSummary {
            source_id: source_id.to_string(),
            fingerprint,
            profiled_at,
            entity_count,
        }))
    }

    /// Return all entities (with their attributes) for a source.
    pub fn get_source_full_profile(
        &self,
        source_id: &str,
    ) -> Result<Option<FullSourceProfile>, String> {
        let summary = match self.get_source_profile_summary(source_id)? {
            None => return Ok(None),
            Some(s) => s,
        };

        // Load entities.
        let entity_rows: Vec<(String, String, i64)> = {
            let mut stmt = self.conn
                .prepare(
                    "SELECT id, name, row_count FROM source_entities
                     WHERE source_id = ?1 ORDER BY created_at ASC",
                )
                .map_err(|e| format!("Failed to prepare entities query: {e}"))?;

            let rows: Vec<(String, String, i64)> = stmt.query_map(params![source_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(|e| format!("Failed to query entities: {e}"))?
            .filter_map(|r| r.ok())
            .collect();
            rows
        };

        let mut entities = Vec::new();
        let mut all_fk_candidates: Vec<FkCandidate> = Vec::new();

        for (entity_id, entity_name, row_count) in entity_rows {
            // Load attributes.
            let attributes: Vec<SourceAttributeProfile> = {
                let mut stmt = self.conn
                    .prepare(
                        "SELECT name, inferred_type, is_nullable, is_pk,
                                null_pct, unique_pct, min_value, max_value, top_values
                         FROM source_attributes WHERE entity_id = ?1
                         ORDER BY created_at ASC",
                    )
                    .map_err(|e| format!("Failed to prepare attributes query: {e}"))?;

                type AttrRow = (String, String, i32, i32, f64, f64, Option<String>, Option<String>, String);
                let raw: Vec<AttrRow> = stmt.query_map(params![entity_id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i32>(2)?,
                        row.get::<_, i32>(3)?,
                        row.get::<_, f64>(4)?,
                        row.get::<_, f64>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, Option<String>>(7)?,
                        row.get::<_, String>(8)?,
                    ))
                })
                .map_err(|e| format!("Failed to query attributes: {e}"))?
                .filter_map(|r| r.ok())
                .collect();

                raw.into_iter().map(|(name, inferred_type, is_nullable, is_pk, null_pct,
                       unique_pct, min_value, max_value, top_json)| {
                    let top_values: Vec<TopValue> = serde_json::from_str(&top_json)
                        .unwrap_or_default();
                    SourceAttributeProfile {
                        name,
                        inferred_type,
                        is_nullable: is_nullable != 0,
                        is_pk: is_pk != 0,
                        null_pct,
                        unique_pct,
                        min_value,
                        max_value,
                        top_values,
                    }
                }).collect()
            };

            entities.push(EntityWithAttributes {
                profile: SourceEntityProfile {
                    source_id: source_id.to_string(),
                    name: entity_name,
                    row_count,
                },
                attributes,
            });
        }

        // Load FK candidates.
        {
            let mut stmt = self.conn
                .prepare(
                    "SELECT from_entity, from_column, to_entity, to_column, is_declared
                     FROM source_fk_candidates WHERE source_id = ?1",
                )
                .map_err(|e| format!("Failed to prepare FK query: {e}"))?;

            let rows: Vec<FkCandidate> = stmt
                .query_map(params![source_id], |row| {
                    Ok(FkCandidate {
                        source_id: source_id.to_string(),
                        from_entity: row.get(0)?,
                        from_column: row.get(1)?,
                        to_entity: row.get(2)?,
                        to_column: row.get(3)?,
                        is_declared: row.get::<_, i32>(4)? != 0,
                    })
                })
                .map_err(|e| format!("Failed to query FK candidates: {e}"))?
                .filter_map(|r| r.ok())
                .collect();

            all_fk_candidates.extend(rows);
        }

        Ok(Some(FullSourceProfile {
            summary,
            entities,
            fk_candidates: all_fk_candidates,
        }))
    }

    // ── Proposal CRUD ─────────────────────────────────────────────────────────

    /// Persist a freshly generated set of proposals.
    ///
    /// Pending proposals are deleted and re-inserted on every run.
    /// Accepted / rejected proposals are preserved; their reasons are enriched
    /// with any newly detected methods via `INSERT OR IGNORE`.
    pub fn save_proposals(&self, proposals: &[Proposal]) -> Result<(), String> {
        let project_id = self.get_project_state()?.id;
        let now = Utc::now().to_rfc3339();

        // Delete pending proposals — CASCADE removes their reason rows too.
        self.conn
            .execute(
                "DELETE FROM proposals WHERE project_id = ?1 AND status = 'pending'",
                params![project_id],
            )
            .map_err(|e| format!("Failed to delete pending proposals: {e}"))?;

        for p in proposals {
            // Insert proposal (OR IGNORE keeps accepted/rejected rows intact).
            self.conn
                .execute(
                    "INSERT OR IGNORE INTO proposals
                     (id, project_id, status, confidence,
                      from_source_id, from_entity, from_column,
                      to_source_id, to_entity, to_column,
                      suggested_predicate, suggested_cardinality,
                      reviewed_predicate, reviewed_cardinality,
                      created_at, updated_at)
                     VALUES (?1,?2,'pending',?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
                    params![
                        p.id,
                        project_id,
                        p.confidence,
                        p.from_source_id,
                        p.from_entity,
                        p.from_column,
                        p.to_source_id,
                        p.to_entity,
                        p.to_column,
                        p.suggested_predicate,
                        p.suggested_cardinality,
                        p.reviewed_predicate,
                        p.reviewed_cardinality,
                        now,
                        now
                    ],
                )
                .map_err(|e| format!("Failed to insert proposal {}: {e}", p.id))?;

            // For already-accepted/rejected proposals, refresh confidence in case
            // new reasons were discovered.
            self.conn
                .execute(
                    "UPDATE proposals SET confidence = ?1, updated_at = ?2
                     WHERE id = ?3 AND status != 'pending'",
                    params![p.confidence, now, p.id],
                )
                .map_err(|e| format!("Failed to refresh confidence for {}: {e}", p.id))?;

            // Insert reasons (UNIQUE(proposal_id, kind) prevents duplicates per method).
            for reason in &p.reasons {
                let reason_id = Uuid::new_v4().to_string();
                let kind_str = reason.kind.to_db_str();
                let origin_str = reason.origin.to_db_str();
                let evidence_str = serde_json::to_string(&reason.evidence)
                    .unwrap_or_else(|_| "{}".to_string());
                self.conn
                    .execute(
                        "INSERT OR IGNORE INTO proposal_reasons
                         (id, proposal_id, kind, origin, confidence, evidence, created_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                        params![
                            reason_id, p.id, kind_str, origin_str,
                            reason.confidence, evidence_str, now
                        ],
                    )
                    .map_err(|e| format!("Failed to insert reason for {}: {e}", p.id))?;
            }
        }

        Ok(())
    }

    /// Return all proposals for the project, optionally filtered by status.
    /// Each proposal is populated with its full list of reasons.
    /// Results are ordered by confidence descending.
    pub fn list_proposals(
        &self,
        status_filter: Option<&str>,
    ) -> Result<Vec<Proposal>, String> {
        let project_id = self.get_project_state()?.id;

        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, status, confidence,
                        from_source_id, from_entity, from_column,
                        to_source_id, to_entity, to_column,
                        suggested_predicate, suggested_cardinality,
                        reviewed_predicate, reviewed_cardinality,
                        created_at, updated_at
                 FROM proposals
                 WHERE project_id = ?1
                 ORDER BY confidence DESC",
            )
            .map_err(|e| format!("Failed to prepare proposals query: {e}"))?;

        type Row = (
            String, String, f64,
            String, String, String,
            String, String, String,
            String, String,
            Option<String>, Option<String>,
            String, String,
        );

        let raw: Vec<Row> = stmt
            .query_map(params![project_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, String>(10)?,
                    row.get::<_, Option<String>>(11)?,
                    row.get::<_, Option<String>>(12)?,
                    row.get::<_, String>(13)?,
                    row.get::<_, String>(14)?,
                ))
            })
            .map_err(|e| format!("Failed to query proposals: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        let mut proposals = Vec::new();
        for row in raw {
            let (
                id, status_str, confidence,
                from_source_id, from_entity, from_column,
                to_source_id, to_entity, to_column,
                suggested_predicate, suggested_cardinality,
                reviewed_predicate, reviewed_cardinality,
                created_at, updated_at,
            ) = row;

            let status = ProposalStatus::from_db_str(&status_str);

            if let Some(filter) = status_filter {
                if status.to_db_str() != filter {
                    continue;
                }
            }

            let reasons = self.load_reasons_for_proposal(&id)?;

            proposals.push(Proposal {
                id,
                project_id: project_id.clone(),
                status,
                confidence,
                from_source_id,
                from_entity,
                from_column,
                to_source_id,
                to_entity,
                to_column,
                suggested_predicate,
                suggested_cardinality,
                reviewed_predicate,
                reviewed_cardinality,
                reasons,
                created_at,
                updated_at,
            });
        }

        Ok(proposals)
    }

    /// Load all detection reasons for a single proposal, ordered by confidence desc.
    fn load_reasons_for_proposal(&self, proposal_id: &str) -> Result<Vec<ProposalReason>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT kind, origin, confidence, evidence
                 FROM proposal_reasons
                 WHERE proposal_id = ?1
                 ORDER BY confidence DESC",
            )
            .map_err(|e| format!("Failed to prepare reasons query: {e}"))?;

        let reasons: Vec<ProposalReason> = stmt
            .query_map(params![proposal_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| format!("Failed to query reasons: {e}"))?
            .filter_map(|r| r.ok())
            .map(|(kind_str, origin_str, confidence, evidence_str)| {
                let evidence: serde_json::Value =
                    serde_json::from_str(&evidence_str).unwrap_or_default();
                ProposalReason {
                    kind: ProposalKind::from_db_str(&kind_str),
                    origin: ProposalOrigin::from_db_str(&origin_str),
                    confidence,
                    evidence,
                }
            })
            .collect();

        Ok(reasons)
    }

    /// Update a proposal's review status (accept / reject / modify).
    ///
    /// For "modify", `reviewed_predicate` and `reviewed_cardinality` must be provided.
    /// Returns the updated proposal (with reasons populated).
    pub fn review_proposal(
        &self,
        proposal_id: &str,
        action: &str,
        reviewed_predicate: Option<&str>,
        reviewed_cardinality: Option<&str>,
    ) -> Result<Proposal, String> {
        let now = Utc::now().to_rfc3339();

        let (new_status, rp, rc) = match action {
            "accept" => (ProposalStatus::Accepted, None, None),
            "reject" => (ProposalStatus::Rejected, None, None),
            "modify" => (
                ProposalStatus::Modified,
                reviewed_predicate,
                reviewed_cardinality,
            ),
            other => return Err(format!("Unknown review action: '{other}'")),
        };

        let affected = self
            .conn
            .execute(
                "UPDATE proposals
                 SET status = ?1, reviewed_predicate = ?2, reviewed_cardinality = ?3,
                     updated_at = ?4
                 WHERE id = ?5",
                params![new_status.to_db_str(), rp, rc, now, proposal_id],
            )
            .map_err(|e| format!("Failed to update proposal: {e}"))?;

        if affected == 0 {
            return Err(format!("Proposal '{proposal_id}' not found."));
        }

        self.list_proposals(None)?
            .into_iter()
            .find(|p| p.id == proposal_id)
            .ok_or_else(|| format!("Proposal '{proposal_id}' disappeared after update."))
    }

    /// Reset a proposal back to pending, clearing any reviewed predicate/cardinality.
    /// Does not touch schema graph objects already created during promotion.
    pub fn reset_proposal(&self, proposal_id: &str) -> Result<Proposal, String> {
        let now = Utc::now().to_rfc3339();
        let affected = self
            .conn
            .execute(
                "UPDATE proposals
                 SET status = 'pending', reviewed_predicate = NULL,
                     reviewed_cardinality = NULL, updated_at = ?1
                 WHERE id = ?2",
                params![now, proposal_id],
            )
            .map_err(|e| format!("Failed to reset proposal: {e}"))?;

        if affected == 0 {
            return Err(format!("Proposal '{proposal_id}' not found."));
        }

        self.list_proposals(None)?
            .into_iter()
            .find(|p| p.id == proposal_id)
            .ok_or_else(|| format!("Proposal '{proposal_id}' disappeared after reset."))
    }

    // ── Schema Graph CRUD ─────────────────────────────────────────────────────

    /// Create a new canonical entity type for the current project.
    pub fn create_entity_type(
        &self,
        name: &str,
        label: Option<&str>,
        description: Option<&str>,
    ) -> Result<EntityType, String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let project_id = self.get_project_state()?.id;

        self.conn
            .execute(
                "INSERT INTO entity_types (id, project_id, name, label, description, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, project_id, name, label, description, now],
            )
            .map_err(|e| format!("Failed to insert entity type: {e}"))?;

        Ok(EntityType {
            id,
            project_id,
            name: name.to_string(),
            label: label.map(|s| s.to_string()),
            description: description.map(|s| s.to_string()),
            rdf_class: None,
            subject_column: None,
            created_at: now,
        })
    }

    /// Delete a canonical entity type by ID (cascades to bindings and relationships).
    pub fn delete_entity_type(&self, id: &str) -> Result<(), String> {
        let affected = self.conn
            .execute("DELETE FROM entity_types WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete entity type: {e}"))?;

        if affected == 0 {
            return Err(format!("Entity type '{id}' not found."));
        }
        Ok(())
    }

    /// Return all entity types for the current project.
    pub fn list_entity_types(&self) -> Result<Vec<EntityType>, String> {
        let project_id = self.get_project_state()?.id;

        let mut stmt = self.conn
            .prepare(
                "SELECT id, project_id, name, label, description, rdf_class, subject_column, created_at
                 FROM entity_types WHERE project_id = ?1 ORDER BY name ASC",
            )
            .map_err(|e| format!("Failed to prepare entity_types query: {e}"))?;

        let rows: Vec<EntityType> = stmt
            .query_map(params![project_id], |row| {
                Ok(EntityType {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    name: row.get(2)?,
                    label: row.get(3)?,
                    description: row.get(4)?,
                    rdf_class: row.get(5)?,
                    subject_column: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })
            .map_err(|e| format!("Failed to query entity_types: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    }

    /// Add a relationship between two entity types.
    pub fn add_relationship(
        &self,
        source_entity_type_id: &str,
        target_entity_type_id: &str,
        predicate: &str,
        cardinality: Option<&str>,
    ) -> Result<Relationship, String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let project_id = self.get_project_state()?.id;

        self.conn
            .execute(
                "INSERT INTO relationships
                 (id, project_id, source_entity_type_id, target_entity_type_id,
                  predicate, cardinality, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    id, project_id,
                    source_entity_type_id, target_entity_type_id,
                    predicate, cardinality, now
                ],
            )
            .map_err(|e| format!("Failed to insert relationship: {e}"))?;

        Ok(Relationship {
            id,
            project_id,
            source_entity_type_id: source_entity_type_id.to_string(),
            target_entity_type_id: target_entity_type_id.to_string(),
            predicate: predicate.to_string(),
            cardinality: cardinality.map(|s| s.to_string()),
            created_at: now,
        })
    }

    /// Update the predicate (and optionally cardinality) of an existing relationship.
    pub fn update_relationship(
        &self,
        id: &str,
        predicate: &str,
        cardinality: Option<&str>,
    ) -> Result<(), String> {
        let affected = self
            .conn
            .execute(
                "UPDATE relationships SET predicate = ?1, cardinality = ?2 WHERE id = ?3",
                params![predicate, cardinality, id],
            )
            .map_err(|e| format!("Failed to update relationship: {e}"))?;

        if affected == 0 {
            return Err(format!("Relationship '{id}' not found."));
        }
        Ok(())
    }

    /// Delete a relationship by ID.
    pub fn delete_relationship(&self, id: &str) -> Result<(), String> {
        let affected = self.conn
            .execute("DELETE FROM relationships WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete relationship: {e}"))?;

        if affected == 0 {
            return Err(format!("Relationship '{id}' not found."));
        }
        Ok(())
    }

    /// Return all relationships for the current project.
    pub fn list_relationships(&self) -> Result<Vec<Relationship>, String> {
        let project_id = self.get_project_state()?.id;

        let mut stmt = self.conn
            .prepare(
                "SELECT id, project_id, source_entity_type_id, target_entity_type_id,
                        predicate, cardinality, created_at
                 FROM relationships WHERE project_id = ?1 ORDER BY created_at ASC",
            )
            .map_err(|e| format!("Failed to prepare relationships query: {e}"))?;

        let rows: Vec<Relationship> = stmt
            .query_map(params![project_id], |row| {
                Ok(Relationship {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    source_entity_type_id: row.get(2)?,
                    target_entity_type_id: row.get(3)?,
                    predicate: row.get(4)?,
                    cardinality: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .map_err(|e| format!("Failed to query relationships: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    }

    /// Bind a source-local entity to a canonical entity type.
    pub fn bind_source_entity(
        &self,
        entity_type_id: &str,
        source_id: &str,
        entity_name: &str,
    ) -> Result<EntitySourceBinding, String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        self.conn
            .execute(
                "INSERT OR IGNORE INTO entity_source_bindings
                 (id, entity_type_id, source_id, entity_name, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, entity_type_id, source_id, entity_name, now],
            )
            .map_err(|e| format!("Failed to insert entity source binding: {e}"))?;

        // Fetch the actual row (may have pre-existed due to OR IGNORE).
        self.conn
            .query_row(
                "SELECT id, entity_type_id, source_id, entity_name, created_at
                 FROM entity_source_bindings
                 WHERE entity_type_id = ?1 AND source_id = ?2 AND entity_name = ?3",
                params![entity_type_id, source_id, entity_name],
                |row| {
                    Ok(EntitySourceBinding {
                        id: row.get(0)?,
                        entity_type_id: row.get(1)?,
                        source_id: row.get(2)?,
                        entity_name: row.get(3)?,
                        created_at: row.get(4)?,
                    })
                },
            )
            .map_err(|e| format!("Failed to read entity source binding: {e}"))
    }

    /// Remove a binding between a source-local entity and a canonical entity type.
    pub fn unbind_source_entity(
        &self,
        entity_type_id: &str,
        source_id: &str,
        entity_name: &str,
    ) -> Result<(), String> {
        let affected = self.conn
            .execute(
                "DELETE FROM entity_source_bindings
                 WHERE entity_type_id = ?1 AND source_id = ?2 AND entity_name = ?3",
                params![entity_type_id, source_id, entity_name],
            )
            .map_err(|e| format!("Failed to delete entity source binding: {e}"))?;

        if affected == 0 {
            return Err(format!(
                "Binding for entity type '{entity_type_id}', source '{source_id}', \
                 entity '{entity_name}' not found."
            ));
        }
        Ok(())
    }

    /// Return the full schema graph (entity types + bindings + relationships)
    /// for the current project.
    pub fn get_schema_graph(&self) -> Result<SchemaGraph, String> {
        let project_id = self.get_project_state()?.id;

        // Load entity types.
        let entity_types = self.list_entity_types()?;

        // Load all bindings for this project in one query.
        let mut stmt = self.conn
            .prepare(
                "SELECT esb.id, esb.entity_type_id, esb.source_id, esb.entity_name, esb.created_at
                 FROM entity_source_bindings esb
                 JOIN entity_types et ON et.id = esb.entity_type_id
                 WHERE et.project_id = ?1",
            )
            .map_err(|e| format!("Failed to prepare bindings query: {e}"))?;

        let all_bindings: Vec<EntitySourceBinding> = stmt
            .query_map(params![project_id], |row| {
                Ok(EntitySourceBinding {
                    id: row.get(0)?,
                    entity_type_id: row.get(1)?,
                    source_id: row.get(2)?,
                    entity_name: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })
            .map_err(|e| format!("Failed to query bindings: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        // Associate bindings with their entity types.
        let entity_types_with_bindings: Vec<EntityTypeWithBindings> = entity_types
            .into_iter()
            .map(|et| {
                let bindings: Vec<EntitySourceBinding> = all_bindings
                    .iter()
                    .filter(|b| b.entity_type_id == et.id)
                    .cloned()
                    .collect();
                EntityTypeWithBindings {
                    entity_type: et,
                    bindings,
                }
            })
            .collect();

        let relationships = self.list_relationships()?;

        Ok(SchemaGraph {
            entity_types: entity_types_with_bindings,
            relationships,
        })
    }

    /// Return a summary row per source-local entity, enriched with proposal stats
    /// and any existing binding to a canonical entity type.
    pub fn list_source_entities_summary(&self) -> Result<Vec<SourceEntitySummary>, String> {
        let project_id = self.get_project_state()?.id;

        let mut stmt = self.conn
            .prepare(
                "SELECT
                    s.id as source_id,
                    s.name as source_name,
                    se.name as entity_name,
                    se.row_count,
                    COALESCE(p_count.cnt, 0) as proposal_count,
                    COALESCE(p_count.max_conf, 0.0) as max_similarity,
                    esb.entity_type_id as bound_entity_type_id,
                    et.name as bound_entity_type_name
                FROM source_entities se
                JOIN sources s ON se.source_id = s.id
                LEFT JOIN entity_source_bindings esb
                    ON esb.source_id = se.source_id AND esb.entity_name = se.name
                LEFT JOIN entity_types et ON et.id = esb.entity_type_id
                LEFT JOIN (
                    SELECT src_id, ent_name,
                           SUM(cnt) as cnt, MAX(max_conf) as max_conf
                    FROM (
                        SELECT from_source_id as src_id, from_entity as ent_name,
                               COUNT(*) as cnt, MAX(confidence) as max_conf
                        FROM proposals WHERE project_id = ?1 AND status != 'rejected'
                        GROUP BY from_source_id, from_entity
                        UNION ALL
                        SELECT to_source_id, to_entity, COUNT(*), MAX(confidence)
                        FROM proposals WHERE project_id = ?1 AND status != 'rejected'
                        GROUP BY to_source_id, to_entity
                    )
                    GROUP BY src_id, ent_name
                ) p_count ON p_count.src_id = se.source_id AND p_count.ent_name = se.name
                WHERE s.project_id = ?1
                ORDER BY s.name ASC, se.name ASC",
            )
            .map_err(|e| format!("Failed to prepare source_entities_summary query: {e}"))?;

        let rows: Vec<SourceEntitySummary> = stmt
            .query_map(params![project_id], |row| {
                Ok(SourceEntitySummary {
                    source_id: row.get(0)?,
                    source_name: row.get(1)?,
                    entity_name: row.get(2)?,
                    row_count: row.get(3)?,
                    proposal_count: row.get(4)?,
                    max_similarity: row.get(5)?,
                    bound_entity_type_id: row.get(6)?,
                    bound_entity_type_name: row.get(7)?,
                })
            })
            .map_err(|e| format!("Failed to query source_entities_summary: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    }

    // ── Consolidation (Phase 7 / Stage 4) ───────────────────────────────────

    /// Compute and persist pairwise similarity between all source entities.
    /// Returns the resulting pairs (score > threshold).
    pub fn compute_entity_similarities(&self) -> Result<Vec<EntitySimilarityPair>, String> {
        let project = self.get_project_state()?;
        let now = Utc::now().to_rfc3339();

        // Load all source entities with their attributes.
        let entities = self.list_all_entities_with_attributes()?;

        // Clear old similarity pairs (recompute fresh).
        self.conn
            .execute(
                "DELETE FROM entity_similarity_pairs WHERE project_id = ?1",
                params![project.id],
            )
            .map_err(|e| format!("Failed to clear similarity pairs: {e}"))?;

        let mut pairs = Vec::new();
        let threshold = 0.3;

        for i in 0..entities.len() {
            for j in (i + 1)..entities.len() {
                let (ref ea, ref sa_id) = entities[i];
                let (ref eb, ref sb_id) = entities[j];

                let (score, details) = Self::compute_similarity_score(ea, eb);

                if score >= threshold {
                    let id = Uuid::new_v4().to_string();
                    self.conn
                        .execute(
                            "INSERT OR REPLACE INTO entity_similarity_pairs
                             (id, project_id, entity_a_source_id, entity_a_name,
                              entity_b_source_id, entity_b_name,
                              similarity_score, scoring_details, status, created_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9)",
                            params![
                                id, project.id,
                                sa_id, ea.profile.name,
                                sb_id, eb.profile.name,
                                score, serde_json::to_string(&details).unwrap_or_default(),
                                now
                            ],
                        )
                        .map_err(|e| format!("Failed to insert similarity pair: {e}"))?;

                    pairs.push(EntitySimilarityPair {
                        id,
                        project_id: project.id.clone(),
                        entity_a_source_id: sa_id.clone(),
                        entity_a_name: ea.profile.name.clone(),
                        entity_b_source_id: sb_id.clone(),
                        entity_b_name: eb.profile.name.clone(),
                        similarity_score: score,
                        scoring_details: details,
                        status: "pending".to_string(),
                        created_at: now.clone(),
                    });
                }
            }
        }

        Ok(pairs)
    }

    /// List all source entities (across all sources) with their attributes.
    /// Returns (EntityWithAttributes, source_id) tuples.
    fn list_all_entities_with_attributes(&self) -> Result<Vec<(EntityWithAttributes, String)>, String> {
        let project_id = self.get_project_state()?.id;

        let mut stmt = self.conn
            .prepare(
                "SELECT se.id, se.source_id, se.name, se.row_count
                 FROM source_entities se
                 JOIN sources s ON se.source_id = s.id
                 WHERE s.project_id = ?1",
            )
            .map_err(|e| format!("Failed to prepare entities query: {e}"))?;

        let entity_rows: Vec<(String, String, String, i64)> = stmt
            .query_map(params![project_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                ))
            })
            .map_err(|e| format!("Failed to query entities: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        let mut results = Vec::new();
        for (entity_id, source_id, name, row_count) in entity_rows {
            let attributes = self.load_attributes_for_entity(&entity_id)?;
            results.push((
                EntityWithAttributes {
                    profile: SourceEntityProfile {
                        source_id: source_id.clone(),
                        name,
                        row_count,
                    },
                    attributes,
                },
                source_id,
            ));
        }

        Ok(results)
    }

    /// Load attributes for a given source entity (by entity_id).
    fn load_attributes_for_entity(&self, entity_id: &str) -> Result<Vec<SourceAttributeProfile>, String> {
        let mut stmt = self.conn
            .prepare(
                "SELECT name, inferred_type, is_nullable, is_pk, null_pct, unique_pct,
                        min_value, max_value, top_values
                 FROM source_attributes WHERE entity_id = ?1 ORDER BY name ASC",
            )
            .map_err(|e| format!("Failed to prepare attributes query: {e}"))?;

        let attrs: Vec<SourceAttributeProfile> = stmt
            .query_map(params![entity_id], |row| {
                let top_str: String = row.get(8)?;
                let top: Vec<TopValue> =
                    serde_json::from_str(&top_str).unwrap_or_default();
                Ok(SourceAttributeProfile {
                    name: row.get(0)?,
                    inferred_type: row.get(1)?,
                    is_nullable: row.get::<_, bool>(2)?,
                    is_pk: row.get::<_, bool>(3)?,
                    null_pct: row.get(4)?,
                    unique_pct: row.get(5)?,
                    min_value: row.get(6)?,
                    max_value: row.get(7)?,
                    top_values: top,
                })
            })
            .map_err(|e| format!("Failed to query attributes: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(attrs)
    }

    /// Compute a similarity score between two entities based on attribute overlap.
    fn compute_similarity_score(
        a: &EntityWithAttributes,
        b: &EntityWithAttributes,
    ) -> (f64, serde_json::Value) {
        use strsim::jaro_winkler;

        let attrs_a = &a.attributes;
        let attrs_b = &b.attributes;

        if attrs_a.is_empty() || attrs_b.is_empty() {
            return (0.0, serde_json::json!({"reason": "empty attributes"}));
        }

        // Greedy bipartite matching on column name similarity.
        let mut used_b = vec![false; attrs_b.len()];
        let mut matched = 0usize;
        let mut name_score_sum = 0.0_f64;
        let mut type_matches = 0usize;

        for attr_a in attrs_a {
            let mut best_j = None;
            let mut best_sim = 0.0_f64;
            for (j, attr_b) in attrs_b.iter().enumerate() {
                if used_b[j] {
                    continue;
                }
                let sim = jaro_winkler(&attr_a.name.to_lowercase(), &attr_b.name.to_lowercase());
                if sim > best_sim {
                    best_sim = sim;
                    best_j = Some(j);
                }
            }
            if let Some(j) = best_j {
                if best_sim >= 0.80 {
                    used_b[j] = true;
                    matched += 1;
                    name_score_sum += best_sim;
                    if attrs_a.get(0).map(|_| &attr_a.inferred_type) == attrs_b.get(j).map(|ab| &ab.inferred_type) {
                        type_matches += 1;
                    }
                }
            }
        }

        let total_attrs = (attrs_a.len() + attrs_b.len()) as f64 / 2.0;
        let coverage = matched as f64 / total_attrs;
        let avg_name_sim = if matched > 0 { name_score_sum / matched as f64 } else { 0.0 };
        let type_bonus = if matched > 0 { (type_matches as f64 / matched as f64) * 0.1 } else { 0.0 };

        // Entity name similarity bonus.
        let entity_name_sim = jaro_winkler(&a.profile.name.to_lowercase(), &b.profile.name.to_lowercase());
        let entity_name_bonus = if entity_name_sim > 0.80 { (entity_name_sim - 0.80) * 1.0 } else { 0.0 };

        let score = (coverage * 0.5 + avg_name_sim * 0.3 + type_bonus + entity_name_bonus).min(1.0);

        let details = serde_json::json!({
            "matched_columns": matched,
            "total_a": attrs_a.len(),
            "total_b": attrs_b.len(),
            "avg_name_similarity": avg_name_sim,
            "coverage": coverage,
            "type_matches": type_matches,
            "entity_name_similarity": entity_name_sim,
        });

        (score, details)
    }

    /// List similarity pairs, optionally filtered by status.
    pub fn list_entity_similarity_pairs(
        &self,
        status_filter: Option<&str>,
    ) -> Result<Vec<EntitySimilarityPair>, String> {
        let project_id = self.get_project_state()?.id;

        let (sql, params_vec): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = match status_filter {
            Some(status) => (
                "SELECT id, project_id, entity_a_source_id, entity_a_name,
                        entity_b_source_id, entity_b_name,
                        similarity_score, scoring_details, status, created_at
                 FROM entity_similarity_pairs
                 WHERE project_id = ?1 AND status = ?2
                 ORDER BY similarity_score DESC".to_string(),
                vec![Box::new(project_id.clone()), Box::new(status.to_string())],
            ),
            None => (
                "SELECT id, project_id, entity_a_source_id, entity_a_name,
                        entity_b_source_id, entity_b_name,
                        similarity_score, scoring_details, status, created_at
                 FROM entity_similarity_pairs
                 WHERE project_id = ?1
                 ORDER BY similarity_score DESC".to_string(),
                vec![Box::new(project_id.clone())],
            ),
        };

        let mut stmt = self.conn
            .prepare(&sql)
            .map_err(|e| format!("Failed to prepare similarity query: {e}"))?;

        let params_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

        let rows: Vec<EntitySimilarityPair> = stmt
            .query_map(params_refs.as_slice(), |row| {
                let details_str: String = row.get(7)?;
                Ok(EntitySimilarityPair {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    entity_a_source_id: row.get(2)?,
                    entity_a_name: row.get(3)?,
                    entity_b_source_id: row.get(4)?,
                    entity_b_name: row.get(5)?,
                    similarity_score: row.get(6)?,
                    scoring_details: serde_json::from_str(&details_str).unwrap_or(serde_json::json!({})),
                    status: row.get(8)?,
                    created_at: row.get(9)?,
                })
            })
            .map_err(|e| format!("Failed to query similarity pairs: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    }

    /// Get comparison data for two source entities (attribute alignment + profiles).
    pub fn get_entity_comparison(
        &self,
        entity_a_source_id: &str,
        entity_a_name: &str,
        entity_b_source_id: &str,
        entity_b_name: &str,
    ) -> Result<EntityComparisonData, String> {
        // Load entity A profile.
        let entity_a = self.load_entity_with_attributes(entity_a_source_id, entity_a_name)?;
        // Load entity B profile.
        let entity_b = self.load_entity_with_attributes(entity_b_source_id, entity_b_name)?;

        // Compute attribute alignment.
        let alignments = Self::compute_attribute_alignment(&entity_a, &entity_b);

        // Compute similarity score.
        let (score, details) = Self::compute_similarity_score(&entity_a, &entity_b);

        Ok(EntityComparisonData {
            entity_a,
            entity_b,
            attribute_alignments: alignments,
            similarity_score: score,
            scoring_details: details,
        })
    }

    /// Load a single source entity with its attributes by source_id + entity name.
    fn load_entity_with_attributes(
        &self,
        source_id: &str,
        entity_name: &str,
    ) -> Result<EntityWithAttributes, String> {
        let (entity_id, row_count): (String, i64) = self.conn
            .query_row(
                "SELECT id, row_count FROM source_entities
                 WHERE source_id = ?1 AND name = ?2",
                params![source_id, entity_name],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Source entity '{entity_name}' not found in source '{source_id}': {e}"))?;

        let attributes = self.load_attributes_for_entity(&entity_id)?;

        Ok(EntityWithAttributes {
            profile: SourceEntityProfile {
                source_id: source_id.to_string(),
                name: entity_name.to_string(),
                row_count,
            },
            attributes,
        })
    }

    /// Compute attribute alignment between two entities using greedy bipartite matching.
    fn compute_attribute_alignment(
        a: &EntityWithAttributes,
        b: &EntityWithAttributes,
    ) -> Vec<AttributeAlignment> {
        use strsim::jaro_winkler;

        let attrs_a = &a.attributes;
        let attrs_b = &b.attributes;
        let mut used_b = vec![false; attrs_b.len()];
        let mut alignments = Vec::new();

        // Greedy matching: for each A attribute, find best unmatched B attribute.
        for attr_a in attrs_a {
            let mut best_j = None;
            let mut best_sim = 0.0_f64;

            for (j, attr_b) in attrs_b.iter().enumerate() {
                if used_b[j] {
                    continue;
                }
                let norm_a = attr_a.name.to_lowercase().replace(['_', '-'], "");
                let norm_b = attr_b.name.to_lowercase().replace(['_', '-'], "");

                let sim = if norm_a == norm_b {
                    1.0
                } else {
                    jaro_winkler(&norm_a, &norm_b)
                };

                if sim > best_sim {
                    best_sim = sim;
                    best_j = Some(j);
                }
            }

            if let Some(j) = best_j {
                if best_sim >= 0.80 {
                    used_b[j] = true;
                    let match_type = if best_sim >= 0.98 {
                        AttributeMatchType::Exact
                    } else {
                        AttributeMatchType::Inferred
                    };
                    alignments.push(AttributeAlignment {
                        source_a_column: Some(attr_a.name.clone()),
                        source_a_type: Some(attr_a.inferred_type.clone()),
                        source_b_column: Some(attrs_b[j].name.clone()),
                        source_b_type: Some(attrs_b[j].inferred_type.clone()),
                        match_type,
                        confidence: best_sim,
                    });
                } else {
                    // Below threshold: unmatched A.
                    alignments.push(AttributeAlignment {
                        source_a_column: Some(attr_a.name.clone()),
                        source_a_type: Some(attr_a.inferred_type.clone()),
                        source_b_column: None,
                        source_b_type: None,
                        match_type: AttributeMatchType::UnmatchedA,
                        confidence: 0.0,
                    });
                }
            } else {
                alignments.push(AttributeAlignment {
                    source_a_column: Some(attr_a.name.clone()),
                    source_a_type: Some(attr_a.inferred_type.clone()),
                    source_b_column: None,
                    source_b_type: None,
                    match_type: AttributeMatchType::UnmatchedA,
                    confidence: 0.0,
                });
            }
        }

        // Add unmatched B columns.
        for (j, attr_b) in attrs_b.iter().enumerate() {
            if !used_b[j] {
                alignments.push(AttributeAlignment {
                    source_a_column: None,
                    source_a_type: None,
                    source_b_column: Some(attr_b.name.clone()),
                    source_b_type: Some(attr_b.inferred_type.clone()),
                    match_type: AttributeMatchType::UnmatchedB,
                    confidence: 0.0,
                });
            }
        }

        alignments
    }

    /// Execute a merge consolidation decision.
    pub fn execute_merge(
        &self,
        canonical_name: &str,
        entity_a_source_id: &str,
        entity_a_name: &str,
        entity_b_source_id: &str,
        entity_b_name: &str,
        attribute_mapping_config: serde_json::Value,
    ) -> Result<ConsolidationDecision, String> {
        let project_id = self.get_project_state()?.id;
        let now = Utc::now().to_rfc3339();

        // Create or reuse canonical entity type.
        let entity_type = match self.find_entity_type_by_name(canonical_name)? {
            Some(et) => et,
            None => self.create_entity_type(canonical_name, None, None)?,
        };

        // Bind both source entities (idempotent).
        let _ = self.bind_source_entity(&entity_type.id, entity_a_source_id, entity_a_name);
        let _ = self.bind_source_entity(&entity_type.id, entity_b_source_id, entity_b_name);

        // Remap relationships from any old entity types bound to these source entities.
        let remapped = self.remap_relationships_for_merge(&entity_type.id, entity_a_source_id, entity_a_name, entity_b_source_id, entity_b_name)?;

        // Mark similarity pair as resolved.
        self.conn
            .execute(
                "UPDATE entity_similarity_pairs SET status = 'resolved'
                 WHERE project_id = ?1
                   AND entity_a_source_id = ?2 AND entity_a_name = ?3
                   AND entity_b_source_id = ?4 AND entity_b_name = ?5",
                params![project_id, entity_a_source_id, entity_a_name, entity_b_source_id, entity_b_name],
            )
            .ok();

        // Store consolidation decision.
        let decision_id = Uuid::new_v4().to_string();
        let config = serde_json::json!({
            "attribute_mapping": attribute_mapping_config,
            "remapped_relationships": remapped,
        });

        self.conn
            .execute(
                "INSERT INTO consolidation_decisions
                 (id, project_id, decision_type, entity_a_source_id, entity_a_name,
                  entity_b_source_id, entity_b_name, result_entity_type_id, config,
                  created_at, updated_at)
                 VALUES (?1, ?2, 'merge', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    decision_id, project_id,
                    entity_a_source_id, entity_a_name,
                    entity_b_source_id, entity_b_name,
                    entity_type.id,
                    serde_json::to_string(&config).unwrap_or_default(),
                    now, now
                ],
            )
            .map_err(|e| format!("Failed to store consolidation decision: {e}"))?;

        self.log_change("execute_merge", "consolidation_decision", &decision_id, &serde_json::to_string(&config).unwrap_or_default(), "{}")?;

        Ok(ConsolidationDecision {
            id: decision_id,
            project_id,
            decision_type: ConsolidationDecisionType::Merge,
            entity_a_source_id: entity_a_source_id.to_string(),
            entity_a_name: entity_a_name.to_string(),
            entity_b_source_id: entity_b_source_id.to_string(),
            entity_b_name: entity_b_name.to_string(),
            result_entity_type_id: Some(entity_type.id),
            result_relationship_id: None,
            parent_entity_type_id: None,
            child_entity_type_id: None,
            config,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Find entity type by name for the current project.
    fn find_entity_type_by_name(&self, name: &str) -> Result<Option<EntityType>, String> {
        let project_id = self.get_project_state()?.id;
        self.conn
            .query_row(
                "SELECT id, project_id, name, label, description, rdf_class, subject_column, created_at
                 FROM entity_types WHERE project_id = ?1 AND name = ?2",
                params![project_id, name],
                |row| {
                    Ok(EntityType {
                        id: row.get(0)?,
                        project_id: row.get(1)?,
                        name: row.get(2)?,
                        label: row.get(3)?,
                        description: row.get(4)?,
                        rdf_class: row.get(5)?,
                        subject_column: row.get(6)?,
                        created_at: row.get(7)?,
                    })
                },
            )
            .optional()
            .map_err(|e| format!("Failed to find entity type: {e}"))
    }

    /// Remap relationships after a merge: any relationship whose source or target
    /// entity type was bound to one of the merged source entities should point
    /// to the new canonical type.
    fn remap_relationships_for_merge(
        &self,
        canonical_entity_type_id: &str,
        entity_a_source_id: &str,
        entity_a_name: &str,
        entity_b_source_id: &str,
        entity_b_name: &str,
    ) -> Result<serde_json::Value, String> {
        // Find entity types bound to these source entities (excluding the canonical type).
        let mut stmt = self.conn
            .prepare(
                "SELECT DISTINCT entity_type_id FROM entity_source_bindings
                 WHERE (source_id = ?1 AND entity_name = ?2)
                    OR (source_id = ?3 AND entity_name = ?4)",
            )
            .map_err(|e| format!("Failed to find bound entity types: {e}"))?;

        let old_type_ids: Vec<String> = stmt
            .query_map(
                params![entity_a_source_id, entity_a_name, entity_b_source_id, entity_b_name],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to query bound entity types: {e}"))?
            .filter_map(|r| r.ok())
            .filter(|id: &String| id != canonical_entity_type_id)
            .collect();

        let mut remapped = Vec::new();

        for old_id in &old_type_ids {
            // Remap source side.
            let n1 = self.conn
                .execute(
                    "UPDATE relationships SET source_entity_type_id = ?1
                     WHERE source_entity_type_id = ?2",
                    params![canonical_entity_type_id, old_id],
                )
                .unwrap_or(0);

            // Remap target side.
            let n2 = self.conn
                .execute(
                    "UPDATE relationships SET target_entity_type_id = ?1
                     WHERE target_entity_type_id = ?2",
                    params![canonical_entity_type_id, old_id],
                )
                .unwrap_or(0);

            if n1 > 0 || n2 > 0 {
                remapped.push(serde_json::json!({
                    "old_entity_type_id": old_id,
                    "source_side": n1,
                    "target_side": n2,
                }));
            }
        }

        Ok(serde_json::json!(remapped))
    }

    /// Execute a link consolidation decision.
    pub fn execute_link(
        &self,
        entity_a_source_id: &str,
        entity_a_name: &str,
        entity_b_source_id: &str,
        entity_b_name: &str,
        predicate: &str,
        reversed: bool,
    ) -> Result<ConsolidationDecision, String> {
        let project_id = self.get_project_state()?.id;
        let now = Utc::now().to_rfc3339();

        // Ensure entity types exist for both.
        let et_a = self.ensure_entity_type_for_source(entity_a_source_id, entity_a_name)?;
        let et_b = self.ensure_entity_type_for_source(entity_b_source_id, entity_b_name)?;

        // Create relationship.
        let (source_id, target_id) = if reversed { (&et_b.id, &et_a.id) } else { (&et_a.id, &et_b.id) };
        let rel = self.add_relationship(source_id, target_id, predicate, None)?;

        // Mark pair resolved.
        self.conn
            .execute(
                "UPDATE entity_similarity_pairs SET status = 'resolved'
                 WHERE project_id = ?1
                   AND entity_a_source_id = ?2 AND entity_a_name = ?3
                   AND entity_b_source_id = ?4 AND entity_b_name = ?5",
                params![project_id, entity_a_source_id, entity_a_name, entity_b_source_id, entity_b_name],
            )
            .ok();

        let decision_id = Uuid::new_v4().to_string();
        self.conn
            .execute(
                "INSERT INTO consolidation_decisions
                 (id, project_id, decision_type, entity_a_source_id, entity_a_name,
                  entity_b_source_id, entity_b_name, result_relationship_id,
                  config, created_at, updated_at)
                 VALUES (?1, ?2, 'link', ?3, ?4, ?5, ?6, ?7, '{}', ?8, ?9)",
                params![
                    decision_id, project_id,
                    entity_a_source_id, entity_a_name,
                    entity_b_source_id, entity_b_name,
                    rel.id, now, now
                ],
            )
            .map_err(|e| format!("Failed to store link decision: {e}"))?;

        self.log_change("execute_link", "consolidation_decision", &decision_id, "{}", "{}")?;

        Ok(ConsolidationDecision {
            id: decision_id,
            project_id,
            decision_type: ConsolidationDecisionType::Link,
            entity_a_source_id: entity_a_source_id.to_string(),
            entity_a_name: entity_a_name.to_string(),
            entity_b_source_id: entity_b_source_id.to_string(),
            entity_b_name: entity_b_name.to_string(),
            result_entity_type_id: None,
            result_relationship_id: Some(rel.id),
            parent_entity_type_id: None,
            child_entity_type_id: None,
            config: serde_json::json!({}),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Execute a subtype consolidation decision.
    pub fn execute_subtype(
        &self,
        parent_source_id: &str,
        parent_entity_name: &str,
        child_source_id: &str,
        child_entity_name: &str,
    ) -> Result<ConsolidationDecision, String> {
        let project_id = self.get_project_state()?.id;
        let now = Utc::now().to_rfc3339();

        let parent_et = self.ensure_entity_type_for_source(parent_source_id, parent_entity_name)?;
        let child_et = self.ensure_entity_type_for_source(child_source_id, child_entity_name)?;

        let rel = self.add_relationship(&child_et.id, &parent_et.id, "rdfs:subClassOf", None)?;

        // Mark pair resolved.
        self.conn
            .execute(
                "UPDATE entity_similarity_pairs SET status = 'resolved'
                 WHERE project_id = ?1
                   AND ((entity_a_source_id = ?2 AND entity_a_name = ?3 AND entity_b_source_id = ?4 AND entity_b_name = ?5)
                     OR (entity_a_source_id = ?4 AND entity_a_name = ?5 AND entity_b_source_id = ?2 AND entity_b_name = ?3))",
                params![project_id, parent_source_id, parent_entity_name, child_source_id, child_entity_name],
            )
            .ok();

        let decision_id = Uuid::new_v4().to_string();
        self.conn
            .execute(
                "INSERT INTO consolidation_decisions
                 (id, project_id, decision_type, entity_a_source_id, entity_a_name,
                  entity_b_source_id, entity_b_name, result_relationship_id,
                  parent_entity_type_id, child_entity_type_id,
                  config, created_at, updated_at)
                 VALUES (?1, ?2, 'subtype', ?3, ?4, ?5, ?6, ?7, ?8, ?9, '{}', ?10, ?11)",
                params![
                    decision_id, project_id,
                    parent_source_id, parent_entity_name,
                    child_source_id, child_entity_name,
                    rel.id, parent_et.id, child_et.id, now, now
                ],
            )
            .map_err(|e| format!("Failed to store subtype decision: {e}"))?;

        self.log_change("execute_subtype", "consolidation_decision", &decision_id, "{}", "{}")?;

        Ok(ConsolidationDecision {
            id: decision_id,
            project_id,
            decision_type: ConsolidationDecisionType::Subtype,
            entity_a_source_id: parent_source_id.to_string(),
            entity_a_name: parent_entity_name.to_string(),
            entity_b_source_id: child_source_id.to_string(),
            entity_b_name: child_entity_name.to_string(),
            result_entity_type_id: None,
            result_relationship_id: Some(rel.id),
            parent_entity_type_id: Some(parent_et.id),
            child_entity_type_id: Some(child_et.id),
            config: serde_json::json!({}),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Execute a keep-separate consolidation decision.
    pub fn execute_keep_separate(
        &self,
        entity_a_source_id: &str,
        entity_a_name: &str,
        entity_b_source_id: &str,
        entity_b_name: &str,
    ) -> Result<ConsolidationDecision, String> {
        let project_id = self.get_project_state()?.id;
        let now = Utc::now().to_rfc3339();

        // Mark pair resolved.
        self.conn
            .execute(
                "UPDATE entity_similarity_pairs SET status = 'resolved'
                 WHERE project_id = ?1
                   AND entity_a_source_id = ?2 AND entity_a_name = ?3
                   AND entity_b_source_id = ?4 AND entity_b_name = ?5",
                params![project_id, entity_a_source_id, entity_a_name, entity_b_source_id, entity_b_name],
            )
            .ok();

        let decision_id = Uuid::new_v4().to_string();
        self.conn
            .execute(
                "INSERT INTO consolidation_decisions
                 (id, project_id, decision_type, entity_a_source_id, entity_a_name,
                  entity_b_source_id, entity_b_name, config, created_at, updated_at)
                 VALUES (?1, ?2, 'keep_separate', ?3, ?4, ?5, ?6, '{}', ?7, ?8)",
                params![
                    decision_id, project_id,
                    entity_a_source_id, entity_a_name,
                    entity_b_source_id, entity_b_name,
                    now, now
                ],
            )
            .map_err(|e| format!("Failed to store keep_separate decision: {e}"))?;

        self.log_change("execute_keep_separate", "consolidation_decision", &decision_id, "{}", "{}")?;

        Ok(ConsolidationDecision {
            id: decision_id,
            project_id,
            decision_type: ConsolidationDecisionType::KeepSeparate,
            entity_a_source_id: entity_a_source_id.to_string(),
            entity_a_name: entity_a_name.to_string(),
            entity_b_source_id: entity_b_source_id.to_string(),
            entity_b_name: entity_b_name.to_string(),
            result_entity_type_id: None,
            result_relationship_id: None,
            parent_entity_type_id: None,
            child_entity_type_id: None,
            config: serde_json::json!({}),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Ensure a canonical entity type exists for a source entity, creating + binding if needed.
    fn ensure_entity_type_for_source(
        &self,
        source_id: &str,
        entity_name: &str,
    ) -> Result<EntityType, String> {
        // Check if already bound.
        let existing: Option<String> = self.conn
            .query_row(
                "SELECT entity_type_id FROM entity_source_bindings
                 WHERE source_id = ?1 AND entity_name = ?2 LIMIT 1",
                params![source_id, entity_name],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("Failed to check bindings: {e}"))?;

        if let Some(et_id) = existing {
            // Return existing entity type.
            return self.conn
                .query_row(
                    "SELECT id, project_id, name, label, description, rdf_class, subject_column, created_at
                     FROM entity_types WHERE id = ?1",
                    params![et_id],
                    |row| {
                        Ok(EntityType {
                            id: row.get(0)?,
                            project_id: row.get(1)?,
                            name: row.get(2)?,
                            label: row.get(3)?,
                            description: row.get(4)?,
                            rdf_class: row.get(5)?,
                            subject_column: row.get(6)?,
                            created_at: row.get(7)?,
                        })
                    },
                )
                .map_err(|e| format!("Entity type not found: {e}"));
        }

        // Create new entity type with the source entity name and bind it.
        let et = self.create_entity_type(entity_name, None, None)?;
        self.bind_source_entity(&et.id, source_id, entity_name)?;
        Ok(et)
    }

    /// List all consolidation decisions for the current project.
    pub fn list_consolidation_decisions(&self) -> Result<Vec<ConsolidationDecision>, String> {
        let project_id = self.get_project_state()?.id;

        let mut stmt = self.conn
            .prepare(
                "SELECT id, project_id, decision_type, entity_a_source_id, entity_a_name,
                        entity_b_source_id, entity_b_name, result_entity_type_id,
                        result_relationship_id, parent_entity_type_id, child_entity_type_id,
                        config, created_at, updated_at
                 FROM consolidation_decisions WHERE project_id = ?1
                 ORDER BY created_at DESC",
            )
            .map_err(|e| format!("Failed to prepare decisions query: {e}"))?;

        let rows: Vec<ConsolidationDecision> = stmt
            .query_map(params![project_id], |row| {
                let config_str: String = row.get(11)?;
                Ok(ConsolidationDecision {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    decision_type: ConsolidationDecisionType::from_db_str(&row.get::<_, String>(2)?),
                    entity_a_source_id: row.get(3)?,
                    entity_a_name: row.get(4)?,
                    entity_b_source_id: row.get(5)?,
                    entity_b_name: row.get(6)?,
                    result_entity_type_id: row.get(7)?,
                    result_relationship_id: row.get(8)?,
                    parent_entity_type_id: row.get(9)?,
                    child_entity_type_id: row.get(10)?,
                    config: serde_json::from_str(&config_str).unwrap_or(serde_json::json!({})),
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            })
            .map_err(|e| format!("Failed to query decisions: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    }

    // ── Attribute Mapping CRUD ────────────────────────────────────────────────

    /// List attribute mappings for a given entity type.
    pub fn list_attribute_mappings(&self, entity_type_id: &str) -> Result<Vec<AttributeMapping>, String> {
        let mut stmt = self.conn
            .prepare(
                "SELECT id, entity_type_id, source_id, source_column, canonical_name,
                        rdf_predicate, xsd_datatype, is_omitted, sort_order,
                        created_at, updated_at
                 FROM attribute_mappings WHERE entity_type_id = ?1
                 ORDER BY sort_order ASC, canonical_name ASC",
            )
            .map_err(|e| format!("Failed to prepare attribute_mappings query: {e}"))?;

        let rows: Vec<AttributeMapping> = stmt
            .query_map(params![entity_type_id], |row| {
                Ok(AttributeMapping {
                    id: row.get(0)?,
                    entity_type_id: row.get(1)?,
                    source_id: row.get(2)?,
                    source_column: row.get(3)?,
                    canonical_name: row.get(4)?,
                    rdf_predicate: row.get(5)?,
                    xsd_datatype: row.get(6)?,
                    is_omitted: row.get::<_, i32>(7)? != 0,
                    sort_order: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            })
            .map_err(|e| format!("Failed to query attribute_mappings: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(rows)
    }

    /// Create or update an attribute mapping.
    pub fn upsert_attribute_mapping(
        &self,
        entity_type_id: &str,
        source_id: &str,
        source_column: &str,
        canonical_name: &str,
        rdf_predicate: Option<&str>,
        xsd_datatype: Option<&str>,
        is_omitted: bool,
        sort_order: i32,
    ) -> Result<AttributeMapping, String> {
        let now = Utc::now().to_rfc3339();
        let id = Uuid::new_v4().to_string();

        self.conn
            .execute(
                "INSERT INTO attribute_mappings
                 (id, entity_type_id, source_id, source_column, canonical_name,
                  rdf_predicate, xsd_datatype, is_omitted, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                 ON CONFLICT(entity_type_id, source_id, source_column) DO UPDATE SET
                    canonical_name = excluded.canonical_name,
                    rdf_predicate = excluded.rdf_predicate,
                    xsd_datatype = excluded.xsd_datatype,
                    is_omitted = excluded.is_omitted,
                    sort_order = excluded.sort_order,
                    updated_at = excluded.updated_at",
                params![
                    id, entity_type_id, source_id, source_column, canonical_name,
                    rdf_predicate, xsd_datatype, is_omitted as i32, sort_order,
                    now, now
                ],
            )
            .map_err(|e| format!("Failed to upsert attribute mapping: {e}"))?;

        // Read back the actual row (may have used existing ID on conflict).
        self.conn
            .query_row(
                "SELECT id, entity_type_id, source_id, source_column, canonical_name,
                        rdf_predicate, xsd_datatype, is_omitted, sort_order,
                        created_at, updated_at
                 FROM attribute_mappings
                 WHERE entity_type_id = ?1 AND source_id = ?2 AND source_column = ?3",
                params![entity_type_id, source_id, source_column],
                |row| {
                    Ok(AttributeMapping {
                        id: row.get(0)?,
                        entity_type_id: row.get(1)?,
                        source_id: row.get(2)?,
                        source_column: row.get(3)?,
                        canonical_name: row.get(4)?,
                        rdf_predicate: row.get(5)?,
                        xsd_datatype: row.get(6)?,
                        is_omitted: row.get::<_, i32>(7)? != 0,
                        sort_order: row.get(8)?,
                        created_at: row.get(9)?,
                        updated_at: row.get(10)?,
                    })
                },
            )
            .map_err(|e| format!("Failed to read back attribute mapping: {e}"))
    }

    /// Delete an attribute mapping by ID.
    pub fn delete_attribute_mapping(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM attribute_mappings WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete attribute mapping: {e}"))?;
        Ok(())
    }

    /// Auto-generate attribute mappings for an entity type from its source bindings.
    pub fn auto_generate_attribute_mappings(
        &self,
        entity_type_id: &str,
    ) -> Result<Vec<AttributeMapping>, String> {
        // Load all bindings for this entity type.
        let mut stmt = self.conn
            .prepare(
                "SELECT source_id, entity_name FROM entity_source_bindings
                 WHERE entity_type_id = ?1",
            )
            .map_err(|e| format!("Failed to prepare bindings query: {e}"))?;

        let bindings: Vec<(String, String)> = stmt
            .query_map(params![entity_type_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| format!("Failed to query bindings: {e}"))?
            .filter_map(|r| r.ok())
            .collect();

        let mut order = 0i32;
        for (source_id, entity_name) in &bindings {
            let entity = self.load_entity_with_attributes(source_id, entity_name)?;
            for attr in &entity.attributes {
                let default_predicate = format!("ex:{}", attr.name);
                let xsd = Self::inferred_type_to_xsd(&attr.inferred_type);
                self.upsert_attribute_mapping(
                    entity_type_id, source_id, &attr.name, &attr.name,
                    Some(&default_predicate), Some(xsd), false, order,
                )?;
                order += 1;
            }
        }

        self.list_attribute_mappings(entity_type_id)
    }

    /// Map inferred column type to XSD datatype.
    fn inferred_type_to_xsd(inferred: &str) -> &'static str {
        match inferred {
            "int" | "integer" | "bigint" => "xsd:integer",
            "float" | "real" | "double" | "decimal" => "xsd:float",
            "bool" | "boolean" => "xsd:boolean",
            "date" => "xsd:date",
            "datetime" | "timestamp" => "xsd:dateTime",
            _ => "xsd:string",
        }
    }

    /// Fetch a single source by ID.
    pub fn get_source(&self, source_id: &str) -> Result<SourceDescriptor, String> {
        self.conn
            .query_row(
                "SELECT id, project_id, name, kind, path, config, created_at, updated_at
                 FROM sources WHERE id = ?1",
                params![source_id],
                |row| {
                    let kind_str: String = row.get(3)?;
                    let config_str: String = row.get(5)?;
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        kind_str,
                        row.get::<_, Option<String>>(4)?,
                        config_str,
                        row.get::<_, String>(6)?,
                        row.get::<_, String>(7)?,
                    ))
                },
            )
            .map_err(|e| format!("Source not found: {e}"))
            .and_then(|(id, project_id, name, kind_str, path, config_str, created_at, updated_at)| {
                let kind = SourceKind::from_db_str(&kind_str)?;
                let config: serde_json::Value =
                    serde_json::from_str(&config_str).unwrap_or(serde_json::Value::Object(Default::default()));
                Ok(SourceDescriptor {
                    id,
                    project_id,
                    name,
                    kind,
                    path,
                    config,
                    created_at,
                    updated_at,
                })
            })
    }
}

// ── Migrations ─────────────────────────────────────────────────────────────

fn apply_migrations(conn: &Connection) -> Result<(), String> {
    // Ensure _meta exists before reading from it (brand-new files have nothing).
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _meta (
            key   TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
        );
        INSERT OR IGNORE INTO _meta (key, value) VALUES ('schema_version', '0');",
    )
    .map_err(|e| format!("Failed to initialise _meta: {e}"))?;

    let version: u32 = conn
        .query_row(
            "SELECT value FROM _meta WHERE key = 'schema_version'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map(|v| v.parse().unwrap_or(0))
        .unwrap_or(0);

    if version < 1 {
        conn.execute_batch(SCHEMA_V1)
            .map_err(|e| format!("Migration 1 failed: {e}"))?;
        conn.execute(
            "UPDATE _meta SET value = '1' WHERE key = 'schema_version'",
            [],
        )
        .map_err(|e| format!("Failed to update schema version: {e}"))?;
    }

    if version < 2 {
        conn.execute_batch(SCHEMA_V2)
            .map_err(|e| format!("Migration 2 failed: {e}"))?;
        conn.execute(
            "UPDATE _meta SET value = '2' WHERE key = 'schema_version'",
            [],
        )
        .map_err(|e| format!("Failed to update schema version: {e}"))?;
    }

    if version < 3 {
        conn.execute_batch(SCHEMA_V3)
            .map_err(|e| format!("Migration 3 failed: {e}"))?;
        conn.execute(
            "UPDATE _meta SET value = '3' WHERE key = 'schema_version'",
            [],
        )
        .map_err(|e| format!("Failed to update schema version: {e}"))?;
    }

    if version < 4 {
        conn.execute_batch(SCHEMA_V4)
            .map_err(|e| format!("Migration 4 failed: {e}"))?;
        conn.execute(
            "UPDATE _meta SET value = '4' WHERE key = 'schema_version'",
            [],
        )
        .map_err(|e| format!("Failed to update schema version: {e}"))?;
    }

    if version < 5 {
        conn.execute_batch(SCHEMA_V5)
            .map_err(|e| format!("Migration 5 failed: {e}"))?;
        conn.execute(
            "UPDATE _meta SET value = '5' WHERE key = 'schema_version'",
            [],
        )
        .map_err(|e| format!("Failed to update schema version: {e}"))?;
    }

    if version < 6 {
        conn.execute_batch(SCHEMA_V6)
            .map_err(|e| format!("Migration 6 failed: {e}"))?;
        conn.execute(
            "UPDATE _meta SET value = '6' WHERE key = 'schema_version'",
            [],
        )
        .map_err(|e| format!("Failed to update schema version: {e}"))?;
    }

    if version < 7 {
        conn.execute_batch(SCHEMA_V7)
            .map_err(|e| format!("Migration 7 (new tables) failed: {e}"))?;
        // ALTER TABLE statements must be executed one at a time in SQLite.
        for stmt in SCHEMA_V7_ALTER.split(';').filter(|s| !s.trim().is_empty()) {
            // Ignore "duplicate column" errors (idempotent migration).
            let _ = conn.execute(stmt.trim(), []);
        }
        conn.execute(
            "UPDATE _meta SET value = '7' WHERE key = 'schema_version'",
            [],
        )
        .map_err(|e| format!("Failed to update schema version: {e}"))?;
    }

    let _ = CURRENT_SCHEMA_VERSION;
    Ok(())
}

// Expose the free function for use inside the impl block.
impl ProjectStore {
    fn apply_migrations(conn: &Connection) -> Result<(), String> {
        apply_migrations(conn)
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Validates a user-supplied project name for use as a filename component.
/// Returns `Err` with a human-readable message if invalid.
pub fn validate_project_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("Project name cannot be empty.".to_string());
    }
    let illegal: &[char] = &['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
    if let Some(c) = name.chars().find(|c| illegal.contains(c)) {
        return Err(format!("Project name contains an illegal character: '{c}'"));
    }
    if name.len() > 200 {
        return Err("Project name must be 200 characters or fewer.".to_string());
    }
    Ok(())
}
