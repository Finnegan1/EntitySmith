use std::path::{Path, PathBuf};

use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, params};
use uuid::Uuid;

use crate::domain::{
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

const CURRENT_SCHEMA_VERSION: u32 = 6;

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
                "SELECT id, project_id, name, label, description, created_at
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
                    created_at: row.get(5)?,
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

    /// Fetch a single source by ID.
    fn get_source(&self, source_id: &str) -> Result<SourceDescriptor, String> {
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
