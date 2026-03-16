use std::path::Path;

use crate::{
    domain::{SourceCapabilities, SourceDescriptor, SourceKind},
    AppState,
};

/// Register a new source in the open project.
///
/// `name`  — display name (may be auto-filled from filename by the frontend).
/// `kind`  — source kind string, e.g. `"sqlite_file"`.
/// `path`  — absolute filesystem path for file/folder-based sources.
///
/// Returns the persisted `SourceDescriptor` on success.
#[tauri::command]
pub async fn add_source(
    name: String,
    kind: String,
    path: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<SourceDescriptor, String> {
    let source_kind = SourceKind::from_db_str(&kind)?;

    validate_source(&name, &source_kind, path.as_deref())?;

    let lock = state.project.lock().unwrap();
    let store = lock
        .as_ref()
        .ok_or("No project is currently open.")?;

    store.add_source(&name, &source_kind, path.as_deref(), "{}")
}

/// Remove a source from the open project.
#[tauri::command]
pub async fn remove_source(
    source_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let lock = state.project.lock().unwrap();
    let store = lock
        .as_ref()
        .ok_or("No project is currently open.")?;

    store.remove_source(&source_id)
}

/// Return all sources registered in the open project.
#[tauri::command]
pub async fn list_sources(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SourceDescriptor>, String> {
    let lock = state.project.lock().unwrap();
    let store = lock
        .as_ref()
        .ok_or("No project is currently open.")?;

    store.list_sources()
}

/// Return the capability metadata for a given source kind.
/// Used by the frontend to conditionally enable profile / sample / enrich actions.
#[tauri::command]
pub async fn source_capabilities(kind: String) -> Result<SourceCapabilities, String> {
    let source_kind = SourceKind::from_db_str(&kind)?;
    Ok(source_kind.capabilities())
}

// ── Validation ────────────────────────────────────────────────────────────────

fn validate_source(name: &str, kind: &SourceKind, path: Option<&str>) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("Source name cannot be empty.".to_string());
    }
    if name.len() > 200 {
        return Err("Source name must be 200 characters or fewer.".to_string());
    }

    // File/folder-based sources must have a path and it must exist.
    match kind {
        SourceKind::Url | SourceKind::Postgres | SourceKind::Mysql => {
            // Non-filesystem sources — path not required here.
        }
        _ => {
            let p = path.ok_or("A file or folder path is required for this source type.")?;
            if !Path::new(p).exists() {
                return Err(format!("Path does not exist: {p}"));
            }
        }
    }

    Ok(())
}
