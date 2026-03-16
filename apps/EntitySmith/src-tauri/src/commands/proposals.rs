//! IPC commands for Stage-3 proposal generation and review.

use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use crate::AppState;
use crate::domain::{FullSourceProfile, Proposal};
use crate::project_store::ProjectStore;
use crate::proposals::{SourceData, generate_proposals};

// ── generate_proposals ────────────────────────────────────────────────────────

/// Kick off a background job that analyses all profiled sources and generates
/// connection proposals. Returns the job ID immediately.
#[tauri::command]
pub async fn generate_proposals_cmd(
    state: State<'_, AppState>,
    app_handle: AppHandle,
) -> Result<String, String> {
    // Extract everything while holding the Mutex, then release it.
    let (project_path, project_id, sources_data) = {
        let guard = state
            .project
            .lock()
            .map_err(|_| "Project lock poisoned".to_string())?;
        let store = guard.as_ref().ok_or("No project open")?;

        let project = store.get_project_state()?;
        let sources = store.list_sources()?;

        let mut sources_data: Vec<(String, FullSourceProfile)> = Vec::new();
        for source in sources {
            if let Some(profile) = store.get_source_full_profile(&source.id)? {
                sources_data.push((source.id, profile));
            }
        }

        (store.path.clone(), project.id, sources_data)
    };

    let job = state.jobs.create("generate_proposals");
    app_handle
        .emit("job:update", &job)
        .map_err(|e| format!("Emit failed: {e}"))?;
    let job_id = job.id.clone();

    let jobs_arc = Arc::clone(&state.jobs);
    let handle = app_handle.clone();

    tauri::async_runtime::spawn(async move {
        if let Some(j) = jobs_arc.set_running(&job_id) {
            let _ = handle.emit("job:update", &j);
        }

        let path_clone = project_path.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            run_generate(path_clone, project_id, sources_data)
        })
        .await;

        match result {
            Ok(Ok(count)) => {
                if let Some(j) = jobs_arc.complete(&job_id, Some(format!("{count} proposals generated"))) {
                    let _ = handle.emit("job:update", &j);
                }
                let _ = handle.emit("proposals:updated", &());
            }
            Ok(Err(e)) => {
                if let Some(j) = jobs_arc.fail(&job_id, &e) {
                    let _ = handle.emit("job:update", &j);
                }
            }
            Err(e) => {
                if let Some(j) = jobs_arc.fail(&job_id, &e.to_string()) {
                    let _ = handle.emit("job:update", &j);
                }
            }
        }
    });

    Ok(job.id)
}

fn run_generate(
    project_path: PathBuf,
    project_id: String,
    sources_data: Vec<(String, FullSourceProfile)>,
) -> Result<usize, String> {
    // Build SourceData slices for the engine
    let engine_input: Vec<SourceData> = sources_data
        .into_iter()
        .map(|(source_id, profile)| SourceData {
            source_id,
            entities: profile.entities,
            fk_candidates: profile.fk_candidates,
        })
        .collect();

    let proposals = generate_proposals(&project_id, &engine_input);
    let count = proposals.len();

    // Open a fresh connection for writing (rusqlite::Connection is !Send)
    let store = ProjectStore::open(&project_path)?;
    store.save_proposals(&proposals)?;

    Ok(count)
}

// ── list_proposals ────────────────────────────────────────────────────────────

/// Return all proposals, optionally filtered by status.
/// status_filter: "pending" | "accepted" | "rejected" | "modified" | null
#[tauri::command]
pub fn list_proposals(
    status_filter: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<Proposal>, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;
    store.list_proposals(status_filter.as_deref())
}

// ── review_proposal ───────────────────────────────────────────────────────────

/// Update the review status of a single proposal.
///
/// `action`: "accept" | "reject" | "modify"
///
/// For "modify", supply `reviewed_predicate` and `reviewed_cardinality`.
#[tauri::command]
pub fn review_proposal(
    proposal_id: String,
    action: String,
    reviewed_predicate: Option<String>,
    reviewed_cardinality: Option<String>,
    state: State<'_, AppState>,
) -> Result<Proposal, String> {
    let guard = state
        .project
        .lock()
        .map_err(|_| "Project lock poisoned".to_string())?;
    let store = guard.as_ref().ok_or("No project open")?;
    store.review_proposal(
        &proposal_id,
        &action,
        reviewed_predicate.as_deref(),
        reviewed_cardinality.as_deref(),
    )
}
