use std::path::{Path, PathBuf};

use chrono::Utc;
use rusqlite::{Connection, params};
use uuid::Uuid;

use crate::domain::{ProjectState, SourceDescriptor, SourceKind};

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

const CURRENT_SCHEMA_VERSION: u32 = 2;

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

    // Future migrations go here:
    // if version < 3 { ... }

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
