//! IPC commands for Attribute Mapping (Phase 7 / Stage 4).

use tauri::{AppHandle, Emitter, State};

use crate::AppState;
use crate::domain::AttributeMapping;

/// List attribute mappings for a given entity type.
#[tauri::command]
pub fn list_attribute_mappings(
    entity_type_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<AttributeMapping>, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    store.list_attribute_mappings(&entity_type_id)
}

/// Create or update an attribute mapping.
#[tauri::command]
pub fn upsert_attribute_mapping(
    entity_type_id: String,
    source_id: String,
    source_column: String,
    canonical_name: String,
    rdf_predicate: Option<String>,
    xsd_datatype: Option<String>,
    is_omitted: bool,
    sort_order: i32,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<AttributeMapping, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    let mapping = store.upsert_attribute_mapping(
        &entity_type_id,
        &source_id,
        &source_column,
        &canonical_name,
        rdf_predicate.as_deref(),
        xsd_datatype.as_deref(),
        is_omitted,
        sort_order,
    )?;

    app_handle.emit("schema:updated", &()).ok();

    Ok(mapping)
}

/// Delete an attribute mapping by ID.
#[tauri::command]
pub fn delete_attribute_mapping(
    id: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    store.delete_attribute_mapping(&id)?;

    app_handle.emit("schema:updated", &()).ok();

    Ok(())
}

/// Auto-generate attribute mappings from source bindings for an entity type.
#[tauri::command]
pub fn auto_generate_attribute_mappings(
    entity_type_id: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<Vec<AttributeMapping>, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    let mappings = store.auto_generate_attribute_mappings(&entity_type_id)?;

    app_handle.emit("schema:updated", &()).ok();

    Ok(mappings)
}
