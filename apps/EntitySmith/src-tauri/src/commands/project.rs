use std::path::PathBuf;

use crate::{
    domain::ProjectState,
    project_store::{validate_project_name, ProjectStore},
    AppState,
};

/// Create a new .entitysmith project file.
///
/// `name`      — display name and filename stem (validated, no illegal chars).
/// `directory` — path to the folder where the file should be created.
///
/// Returns the new `ProjectState` on success. Replaces any currently open
/// project without requiring an explicit `close_project` call first.
#[tauri::command]
pub async fn create_project(
    name: String,
    directory: String,
    state: tauri::State<'_, AppState>,
) -> Result<ProjectState, String> {
    validate_project_name(&name)?;

    let path: PathBuf = PathBuf::from(&directory).join(format!("{}.entitysmith", name));

    let store = ProjectStore::create(&path, &name)?;
    let project_state = store.get_project_state()?;

    *state.project.lock().unwrap() = Some(store);

    Ok(project_state)
}

/// Open an existing .entitysmith project file.
///
/// `path` — absolute path to the .entitysmith file.
///
/// Returns the loaded `ProjectState`. Replaces any currently open project.
#[tauri::command]
pub async fn open_project(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<ProjectState, String> {
    let store = ProjectStore::open(&path)?;
    let project_state = store.get_project_state()?;

    *state.project.lock().unwrap() = Some(store);

    Ok(project_state)
}

/// Close the currently open project.
///
/// Drops the `ProjectStore`, which flushes any pending SQLite WAL and closes
/// the file cleanly. No-op if no project is open.
#[tauri::command]
pub async fn close_project(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    *state.project.lock().unwrap() = None;
    Ok(())
}

/// Returns the `ProjectState` of the currently open project, or `null` if
/// no project is open.
///
/// Used on app startup to detect whether a project was open at last close
/// (crash-recovery in a future phase). Currently always returns `null` on
/// cold start because the project reference is not persisted across restarts.
#[tauri::command]
pub async fn get_project_state(
    state: tauri::State<'_, AppState>,
) -> Result<Option<ProjectState>, String> {
    match state.project.lock().unwrap().as_ref() {
        Some(store) => store.get_project_state().map(Some),
        None => Ok(None),
    }
}
