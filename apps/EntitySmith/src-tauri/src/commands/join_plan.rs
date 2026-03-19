//! IPC commands for Entity Type Join Plan management.

use tauri::{AppHandle, Emitter, State};

use crate::AppState;
use crate::domain::{EntityTypeJoinPlan, EntityTypeJoinStepWithKeys, EntityTypeJoinStep, EntityTypeJoinKey};

/// Get the full join plan for an entity type.
#[tauri::command]
pub fn get_join_plan(
    entity_type_id: String,
    state: State<'_, AppState>,
) -> Result<EntityTypeJoinPlan, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    let raw = store.get_join_plan(&entity_type_id)?;
    let steps = raw
        .into_iter()
        .map(|(step, keys)| EntityTypeJoinStepWithKeys { step, keys })
        .collect();

    Ok(EntityTypeJoinPlan {
        entity_type_id,
        steps,
    })
}

/// Add a join step to an entity type's join plan.
#[tauri::command]
pub fn add_join_step(
    entity_type_id: String,
    step_order: i32,
    source_id: String,
    entity_name: String,
    join_type: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<EntityTypeJoinStep, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    let step = store.add_join_step(&entity_type_id, step_order, &source_id, &entity_name, &join_type)?;
    app_handle.emit("schema:updated", &()).ok();
    Ok(step)
}

/// Remove a join step from the plan.
#[tauri::command]
pub fn remove_join_step(
    step_id: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    store.remove_join_step(&step_id)?;
    app_handle.emit("schema:updated", &()).ok();
    Ok(())
}

/// Reorder join steps.
#[tauri::command]
pub fn reorder_join_steps(
    entity_type_id: String,
    ordered_step_ids: Vec<String>,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    store.reorder_join_steps(&entity_type_id, &ordered_step_ids)?;
    app_handle.emit("schema:updated", &()).ok();
    Ok(())
}

/// Update the join type for a step.
#[tauri::command]
pub fn update_join_step_type(
    step_id: String,
    join_type: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    store.update_join_step_type(&step_id, &join_type)?;
    app_handle.emit("schema:updated", &()).ok();
    Ok(())
}

/// Set join keys for a step. Replaces all existing keys.
#[tauri::command]
pub fn set_join_keys(
    join_step_id: String,
    keys: Vec<(String, String)>,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<Vec<EntityTypeJoinKey>, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    let result = store.set_join_keys(&join_step_id, &keys)?;
    app_handle.emit("schema:updated", &()).ok();
    Ok(result)
}
