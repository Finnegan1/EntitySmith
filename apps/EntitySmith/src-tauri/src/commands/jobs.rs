use tauri::State;

use crate::domain::JobStatus;
use crate::AppState;

/// Return all jobs for the current session, newest first.
#[tauri::command]
pub fn list_jobs(state: State<'_, AppState>) -> Vec<JobStatus> {
    state.jobs.list()
}

/// Return a single job by ID, or `null` if not found.
#[tauri::command]
pub fn get_job(job_id: String, state: State<'_, AppState>) -> Option<JobStatus> {
    state.jobs.get(&job_id)
}
