use std::collections::HashMap;
use std::sync::Mutex;

use chrono::Utc;
use uuid::Uuid;

use crate::domain::{JobState, JobStatus};

// ── JobManager ────────────────────────────────────────────────────────────────

/// In-memory registry of background jobs.
///
/// Lives in `AppState` behind an `Arc` so commands and spawned threads can
/// both update job state without borrowing the full `AppState`.
///
/// Jobs are kept in-memory only for the current session; DB persistence of
/// job history is planned for a later phase.
pub struct JobManager {
    jobs: Mutex<HashMap<String, JobStatus>>,
}

impl JobManager {
    pub fn new() -> Self {
        Self {
            jobs: Mutex::new(HashMap::new()),
        }
    }

    /// Create a new job in the `Queued` state and return a clone of it.
    pub fn create(&self, kind: &str) -> JobStatus {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let job = JobStatus {
            id: id.clone(),
            kind: kind.to_string(),
            status: JobState::Queued,
            progress: None,
            message: None,
            created_at: now.clone(),
            updated_at: now,
        };
        self.jobs.lock().unwrap().insert(id, job.clone());
        job
    }

    /// Transition a job to `Running`.
    pub fn set_running(&self, job_id: &str) -> Option<JobStatus> {
        let mut jobs = self.jobs.lock().unwrap();
        let job = jobs.get_mut(job_id)?;
        job.status = JobState::Running;
        job.updated_at = Utc::now().to_rfc3339();
        Some(job.clone())
    }

    /// Transition a job to `Completed` (progress = 1.0).
    pub fn complete(&self, job_id: &str, message: Option<String>) -> Option<JobStatus> {
        let mut jobs = self.jobs.lock().unwrap();
        let job = jobs.get_mut(job_id)?;
        job.status = JobState::Completed;
        job.progress = Some(1.0);
        job.message = message;
        job.updated_at = Utc::now().to_rfc3339();
        Some(job.clone())
    }

    /// Transition a job to `Failed` with an error message.
    pub fn fail(&self, job_id: &str, error: &str) -> Option<JobStatus> {
        let mut jobs = self.jobs.lock().unwrap();
        let job = jobs.get_mut(job_id)?;
        job.status = JobState::Failed;
        job.message = Some(error.to_string());
        job.updated_at = Utc::now().to_rfc3339();
        Some(job.clone())
    }

    /// Return a snapshot of a single job.
    pub fn get(&self, job_id: &str) -> Option<JobStatus> {
        self.jobs.lock().unwrap().get(job_id).cloned()
    }

    /// Return all jobs ordered by creation time (newest first).
    pub fn list(&self) -> Vec<JobStatus> {
        let jobs = self.jobs.lock().unwrap();
        let mut list: Vec<JobStatus> = jobs.values().cloned().collect();
        list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        list
    }
}
