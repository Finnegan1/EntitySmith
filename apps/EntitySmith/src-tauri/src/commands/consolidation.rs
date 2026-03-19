//! IPC commands for Semantic Consolidation (Phase 7 / Stage 4).

use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State};

use crate::AppState;
use crate::adapters::adapter_for;
use crate::domain::{ConsolidationDecision, EntityComparisonData, EntitySimilarityPair};

/// Compute pairwise similarity scores between all source entities.
/// Runs synchronously (fast enough for typical entity counts).
#[tauri::command]
pub fn compute_entity_similarities(
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<Vec<EntitySimilarityPair>, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    let pairs = store.compute_entity_similarities()?;

    app_handle
        .emit("consolidation:updated", &())
        .map_err(|e| format!("Emit failed: {e}"))?;

    Ok(pairs)
}

/// List similarity pairs, optionally filtered by status ("pending" | "resolved").
#[tauri::command]
pub fn list_entity_similarity_pairs(
    status_filter: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<EntitySimilarityPair>, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    store.list_entity_similarity_pairs(status_filter.as_deref())
}

/// Get comparison data for two source entities (attribute alignment + profiles).
#[tauri::command]
pub fn get_entity_comparison(
    entity_a_source_id: String,
    entity_a_name: String,
    entity_b_source_id: String,
    entity_b_name: String,
    state: State<'_, AppState>,
) -> Result<EntityComparisonData, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    store.get_entity_comparison(
        &entity_a_source_id,
        &entity_a_name,
        &entity_b_source_id,
        &entity_b_name,
    )
}

/// Execute a merge consolidation decision.
#[tauri::command]
pub fn execute_merge(
    canonical_name: String,
    entity_a_source_id: String,
    entity_a_name: String,
    entity_b_source_id: String,
    entity_b_name: String,
    attribute_mapping: serde_json::Value,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<ConsolidationDecision, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    let decision = store.execute_merge(
        &canonical_name,
        &entity_a_source_id,
        &entity_a_name,
        &entity_b_source_id,
        &entity_b_name,
        attribute_mapping,
    )?;

    app_handle.emit("schema:updated", &()).ok();
    app_handle.emit("consolidation:updated", &()).ok();

    Ok(decision)
}

/// Execute a link consolidation decision.
#[tauri::command]
pub fn execute_link(
    entity_a_source_id: String,
    entity_a_name: String,
    entity_b_source_id: String,
    entity_b_name: String,
    predicate: String,
    reversed: bool,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<ConsolidationDecision, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    let decision = store.execute_link(
        &entity_a_source_id,
        &entity_a_name,
        &entity_b_source_id,
        &entity_b_name,
        &predicate,
        reversed,
    )?;

    app_handle.emit("schema:updated", &()).ok();
    app_handle.emit("consolidation:updated", &()).ok();

    Ok(decision)
}

/// Execute a subtype consolidation decision.
#[tauri::command]
pub fn execute_subtype(
    parent_source_id: String,
    parent_entity_name: String,
    child_source_id: String,
    child_entity_name: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<ConsolidationDecision, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    let decision = store.execute_subtype(
        &parent_source_id,
        &parent_entity_name,
        &child_source_id,
        &child_entity_name,
    )?;

    app_handle.emit("schema:updated", &()).ok();
    app_handle.emit("consolidation:updated", &()).ok();

    Ok(decision)
}

/// Execute a keep-separate consolidation decision.
#[tauri::command]
pub fn execute_keep_separate(
    entity_a_source_id: String,
    entity_a_name: String,
    entity_b_source_id: String,
    entity_b_name: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<ConsolidationDecision, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    let decision = store.execute_keep_separate(
        &entity_a_source_id,
        &entity_a_name,
        &entity_b_source_id,
        &entity_b_name,
    )?;

    app_handle.emit("consolidation:updated", &()).ok();

    Ok(decision)
}

/// List all consolidation decisions for the current project.
#[tauri::command]
pub fn list_consolidation_decisions(
    state: State<'_, AppState>,
) -> Result<Vec<ConsolidationDecision>, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    store.list_consolidation_decisions()
}

/// Return sample rows from a source entity (table / file).
#[tauri::command]
pub fn get_sample_rows(
    source_id: String,
    entity_name: String,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<HashMap<String, Option<String>>>, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    let source = store.get_source(&source_id)?;
    let adapter = adapter_for(&source.kind, source.path.as_deref())?
        .ok_or_else(|| format!("No adapter available for source kind {:?}", source.kind))?;

    adapter.sample_rows(&entity_name, limit.unwrap_or(5))
}
