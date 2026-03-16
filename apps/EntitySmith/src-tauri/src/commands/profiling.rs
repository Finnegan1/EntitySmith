use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use crate::adapters::adapter_for;
use crate::domain::{FullSourceProfile, SourceKind, SourceProfileSummary};
use crate::jobs::JobManager;
use crate::project_store::ProjectStore;
use crate::AppState;

// ── profile_source ────────────────────────────────────────────────────────────

/// Enqueue a profiling job for `source_id` and return the job ID immediately.
///
/// The actual adapter work runs on a blocking thread-pool thread so the UI
/// stays responsive for large files. Progress and completion are communicated
/// via two Tauri events:
///
/// - `job:update`       — carries `JobStatus`; fired on queued → running → done/fail
/// - `profile:updated`  — carries the `sourceId` string; fired only on success
///
/// **Cache behaviour:** if the source file's fingerprint (size + mtime) has
/// not changed since the last run, the stored result is returned immediately
/// (the job still completes instantly rather than being skipped, so the UI
/// can treat all profile invocations uniformly).
#[tauri::command]
pub async fn profile_source(
    source_id: String,
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<String, String> {
    // 1. Briefly lock to extract everything the background thread needs.
    //    We clone all data out so the lock is released before we spawn.
    let (project_path, source_kind, source_path, cached_fingerprint) = {
        let guard = state
            .project
            .lock()
            .map_err(|_| "Project lock poisoned".to_string())?;

        let store = guard
            .as_ref()
            .ok_or_else(|| "No project is open".to_string())?;

        let sources = store.list_sources()?;
        let source = sources
            .iter()
            .find(|s| s.id == source_id)
            .ok_or_else(|| format!("Source '{source_id}' not found"))?;

        // Validate that this kind supports profiling before queuing work.
        adapter_for(&source.kind, source.path.as_deref())?
            .ok_or_else(|| {
                format!(
                    "Source kind '{}' does not support profiling",
                    source.kind.to_db_str()
                )
            })?;

        let cached = store
            .get_source_profile_summary(&source_id)?
            .map(|s| s.fingerprint);

        (
            store.path.clone(),
            source.kind.clone(),
            source.path.clone(),
            cached,
        )
    }; // Mutex released here — lock never held across .await.

    // 2. Create the job entry and emit `queued`.
    let job = state.jobs.create("profile_source");
    let job_id = job.id.clone();
    let _ = app_handle.emit("job:update", &job);

    // 3. Clone Arc handles to move into the async task.
    let jobs: Arc<JobManager> = Arc::clone(&state.jobs);
    let jid = job_id.clone();
    let sid = source_id.clone();

    tauri::async_runtime::spawn(async move {
        // Mark running.
        if let Some(j) = jobs.set_running(&jid) {
            let _ = app_handle.emit("job:update", &j);
        }

        // Run the blocking adapter work on the thread pool.
        let result = tauri::async_runtime::spawn_blocking(move || {
            run_profile(project_path, source_kind, source_path, sid, cached_fingerprint)
        })
        .await;

        match result {
            Ok(Ok(())) => {
                if let Some(j) = jobs.complete(&jid, None) {
                    let _ = app_handle.emit("job:update", &j);
                }
                // Signal the frontend that a new profile is available.
                let _ = app_handle.emit("profile:updated", &source_id);
            }
            Ok(Err(e)) => {
                if let Some(j) = jobs.fail(&jid, &e) {
                    let _ = app_handle.emit("job:update", &j);
                }
            }
            Err(e) => {
                if let Some(j) = jobs.fail(&jid, &e.to_string()) {
                    let _ = app_handle.emit("job:update", &j);
                }
            }
        }
    });

    Ok(job_id)
}

/// The pure, blocking part of profiling.  Runs on `spawn_blocking` so it
/// never stalls the async runtime.  Opens its own `ProjectStore` connection
/// for writing (rusqlite `Connection` is `!Send`).
fn run_profile(
    project_path: std::path::PathBuf,
    source_kind: SourceKind,
    source_path: Option<String>,
    source_id: String,
    cached_fingerprint: Option<String>,
) -> Result<(), String> {
    let adapter = adapter_for(&source_kind, source_path.as_deref())?
        .ok_or_else(|| "No adapter available".to_string())?;

    let fingerprint = adapter.fingerprint()?;

    // Cache hit — nothing to write.
    if cached_fingerprint.as_deref() == Some(fingerprint.as_str()) {
        return Ok(());
    }

    let result = adapter.profile()?;

    // Open a fresh ProjectStore for writing.  Opening is fast because all
    // migrations are idempotent and the schema already exists.
    let store = ProjectStore::open(&project_path)?;
    store.save_source_profile(&source_id, &fingerprint, &result)?;

    Ok(())
}

// ── Read-only profile commands ────────────────────────────────────────────────

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
