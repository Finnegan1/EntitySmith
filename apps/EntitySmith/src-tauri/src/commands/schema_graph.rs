//! IPC commands for Schema Graph (Phase 5).

use tauri::{Emitter, State};

use crate::AppState;
use crate::domain::{EntitySourceBinding, EntityType, Relationship, SchemaGraph, SourceEntitySummary};

// ── Entity Types ──────────────────────────────────────────────────────────────

/// Create a new canonical entity type in the current project's schema graph.
#[tauri::command]
pub fn create_entity_type(
    name: String,
    label: Option<String>,
    description: Option<String>,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<EntityType, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    let entity_type = store.create_entity_type(
        &name,
        label.as_deref(),
        description.as_deref(),
    )?;

    app_handle
        .emit("schema:updated", &())
        .map_err(|e| format!("Emit failed: {e}"))?;

    Ok(entity_type)
}

/// Delete a canonical entity type by ID.
/// Cascades to source bindings and relationships referencing this type.
#[tauri::command]
pub fn delete_entity_type(
    id: String,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    store.delete_entity_type(&id)?;

    app_handle
        .emit("schema:updated", &())
        .map_err(|e| format!("Emit failed: {e}"))?;

    Ok(())
}

// ── Schema Graph ──────────────────────────────────────────────────────────────

/// Return the full schema graph snapshot for the current project.
#[tauri::command]
pub fn get_schema_graph(state: State<'_, AppState>) -> Result<SchemaGraph, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;
    store.get_schema_graph()
}

// ── Relationships ─────────────────────────────────────────────────────────────

/// Add a directed relationship between two entity types in the schema graph.
#[tauri::command]
pub fn add_relationship(
    source_entity_type_id: String,
    target_entity_type_id: String,
    predicate: String,
    cardinality: Option<String>,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<Relationship, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    let relationship = store.add_relationship(
        &source_entity_type_id,
        &target_entity_type_id,
        &predicate,
        cardinality.as_deref(),
    )?;

    app_handle
        .emit("schema:updated", &())
        .map_err(|e| format!("Emit failed: {e}"))?;

    Ok(relationship)
}

/// Delete a relationship by ID.
#[tauri::command]
pub fn delete_relationship(
    id: String,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    store.delete_relationship(&id)?;

    app_handle
        .emit("schema:updated", &())
        .map_err(|e| format!("Emit failed: {e}"))?;

    Ok(())
}

// ── Source Bindings ───────────────────────────────────────────────────────────

/// Bind a source-local entity to a canonical entity type.
#[tauri::command]
pub fn bind_source_entity(
    entity_type_id: String,
    source_id: String,
    entity_name: String,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<EntitySourceBinding, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    let binding = store.bind_source_entity(&entity_type_id, &source_id, &entity_name)?;

    app_handle
        .emit("schema:updated", &())
        .map_err(|e| format!("Emit failed: {e}"))?;

    Ok(binding)
}

/// Remove the binding between a source-local entity and a canonical entity type.
#[tauri::command]
pub fn unbind_source_entity(
    entity_type_id: String,
    source_id: String,
    entity_name: String,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    store.unbind_source_entity(&entity_type_id, &source_id, &entity_name)?;

    app_handle
        .emit("schema:updated", &())
        .map_err(|e| format!("Emit failed: {e}"))?;

    Ok(())
}

// ── Entity Catalog ────────────────────────────────────────────────────────────

/// Return a summary of all source-local entities, enriched with proposal stats
/// and any existing canonical entity type binding.
#[tauri::command]
pub fn list_source_entities_summary(
    state: State<'_, AppState>,
) -> Result<Vec<SourceEntitySummary>, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;
    store.list_source_entities_summary()
}

// ── Promote Proposal ──────────────────────────────────────────────────────────

/// Accept a proposal and simultaneously promote it into the schema graph:
/// creates (or reuses) canonical entity types for both endpoints, adds the
/// relationship, creates source bindings for both endpoints, and marks the
/// proposal as accepted.
///
/// Emits both "schema:updated" and "proposals:updated" on success.
#[tauri::command]
pub fn promote_proposal(
    proposal_id: String,
    reversed: Option<bool>,
    inverse_predicate: Option<String>,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;

    // 1. Load the proposal.
    let proposals = store.list_proposals(None)?;
    let proposal = proposals
        .into_iter()
        .find(|p| p.id == proposal_id)
        .ok_or_else(|| format!("Proposal '{proposal_id}' not found."))?;

    // 2. Determine effective predicate and cardinality (user overrides take
    //    priority over the system-generated suggestions).
    let effective_predicate = proposal
        .reviewed_predicate
        .as_deref()
        .unwrap_or(&proposal.suggested_predicate);
    let effective_cardinality = proposal
        .reviewed_cardinality
        .as_deref()
        .or(Some(proposal.suggested_cardinality.as_str()));

    // 3. Ensure entity type for from_entity exists (create if not).
    let existing_types = store.list_entity_types()?;

    let from_et = match existing_types
        .iter()
        .find(|et| et.name == proposal.from_entity)
    {
        Some(et) => et.clone(),
        None => store.create_entity_type(&proposal.from_entity, None, None)?,
    };

    // 4. Ensure entity type for to_entity exists (create if not).
    // Re-fetch so we see the newly-created from_et if they share a name.
    let existing_types = store.list_entity_types()?;
    let to_et = match existing_types
        .iter()
        .find(|et| et.name == proposal.to_entity)
    {
        Some(et) => et.clone(),
        None => store.create_entity_type(&proposal.to_entity, None, None)?,
    };

    // 5. Create the primary relationship, respecting the requested direction.
    let (source_et, target_et) = if reversed.unwrap_or(false) {
        (&to_et, &from_et)
    } else {
        (&from_et, &to_et)
    };
    store.add_relationship(
        &source_et.id,
        &target_et.id,
        effective_predicate,
        effective_cardinality,
    )?;

    // 5b. Optionally create the inverse relationship.
    if let Some(ref inv_pred) = inverse_predicate {
        if !inv_pred.trim().is_empty() {
            store.add_relationship(
                &target_et.id,
                &source_et.id,
                inv_pred.trim(),
                effective_cardinality,
            )?;
        }
    }

    // 6. Bind from_source_id/from_entity → from entity type (idempotent).
    store.bind_source_entity(&from_et.id, &proposal.from_source_id, &proposal.from_entity)?;

    // 7. Bind to_source_id/to_entity → to entity type (idempotent).
    store.bind_source_entity(&to_et.id, &proposal.to_source_id, &proposal.to_entity)?;

    // 8. Mark proposal as accepted.
    store.review_proposal(&proposal_id, "accept", None, None)?;

    // Drop the lock before emitting.
    drop(guard);

    app_handle
        .emit("schema:updated", &())
        .map_err(|e| format!("Emit schema:updated failed: {e}"))?;
    app_handle
        .emit("proposals:updated", &())
        .map_err(|e| format!("Emit proposals:updated failed: {e}"))?;

    Ok(())
}
