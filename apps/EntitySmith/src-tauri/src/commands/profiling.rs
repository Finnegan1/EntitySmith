use tauri::State;

use crate::adapters::adapter_for;
use crate::domain::{FullSourceProfile, SourceProfileSummary};
use crate::AppState;

/// Run the profiling adapter for `source_id` and persist the results.
///
/// If the source has already been profiled and the fingerprint is unchanged,
/// the stored profile is returned immediately (cache hit).
///
/// Returns the profile summary on success.
#[tauri::command]
pub fn profile_source(
    source_id: String,
    state: State<'_, AppState>,
) -> Result<SourceProfileSummary, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;

    let store = guard
        .as_ref()
        .ok_or_else(|| "No project is open".to_string())?;

    // Resolve source descriptor.
    let sources = store.list_sources()?;
    let source = sources
        .iter()
        .find(|s| s.id == source_id)
        .ok_or_else(|| format!("Source '{source_id}' not found"))?;

    // Build the adapter (returns None for non-profilable kinds).
    let adapter = adapter_for(&source.kind, source.path.as_deref())?
        .ok_or_else(|| format!("Source kind '{}' does not support profiling", source.kind.to_db_str()))?;

    // Check cache: fingerprint unchanged → return existing summary.
    let fingerprint = adapter.fingerprint()?;
    if let Some(summary) = store.get_source_profile_summary(&source_id)? {
        if summary.fingerprint == fingerprint {
            return Ok(summary);
        }
    }

    // Run the full profile.
    let result = adapter.profile()?;
    store.save_source_profile(&source_id, &fingerprint, &result)?;

    // Return fresh summary.
    store
        .get_source_profile_summary(&source_id)?
        .ok_or_else(|| "Profile was saved but could not be re-read".to_string())
}

/// Return the full stored profile for `source_id`, or `null` if not yet profiled.
#[tauri::command]
pub fn get_source_profile(
    source_id: String,
    state: State<'_, AppState>,
) -> Result<Option<FullSourceProfile>, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;

    let store = guard
        .as_ref()
        .ok_or_else(|| "No project is open".to_string())?;

    store.get_source_full_profile(&source_id)
}

/// Return just the summary (fingerprint + entity count) for a source, or `null`.
#[tauri::command]
pub fn get_source_profile_summary(
    source_id: String,
    state: State<'_, AppState>,
) -> Result<Option<SourceProfileSummary>, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;

    let store = guard
        .as_ref()
        .ok_or_else(|| "No project is open".to_string())?;

    store.get_source_profile_summary(&source_id)
}
