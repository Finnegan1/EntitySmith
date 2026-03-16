# Phase 4 — Job System and Progress Infrastructure

## Goal

Move long-running operations (source profiling) off the synchronous Tauri command thread and into background tasks. Surface progress to the frontend via Tauri events and a persistent job indicator in the status bar.

## Deliverables

- `JobManager` in-memory store with full lifecycle management
- `AppState` extended with `Arc<JobManager>`
- `profile_source` command rewritten as async with `spawn_blocking`
- `list_jobs` / `get_job` IPC commands
- `useJobs` React hook subscribing to `job:update` events
- `JobsIndicator` status-bar widget
- `useSourceProfile` updated to watch for `profile:updated` events

## Architecture decisions

### Why `Arc<JobManager>` instead of `Mutex<Vec<JobStatus>>` in `AppState`

Background tasks need to update job state _without_ holding the project lock. A separate `Arc<JobManager>` (with its own internal `Mutex<HashMap>`) lets spawned tasks call `jobs.complete(...)` independently. Cloning the `Arc` is cheap; no deadlock risk from lock ordering.

### Why two events (`job:update` + `profile:updated`)

`job:update` carries the full `JobStatus` struct and is consumed by the generic `JobsIndicator` regardless of job kind. `profile:updated` carries only a `sourceId` string and is consumed by the `SourceDetail` panel to trigger a targeted reload. Keeping them separate avoids the panel having to filter job events by kind/sourceId, and avoids the job indicator needing to understand profile semantics.

### Why `spawn_blocking` instead of a raw `std::thread::spawn`

Tauri's async runtime is Tokio. CPU/IO-bound work that blocks the thread pool should go into `spawn_blocking`, which Tokio routes to a dedicated blocking thread pool. Using `tokio::task::spawn_blocking` also lets us `.await` the result in the async command handler, which keeps error propagation clean.

### Why `profile_source` opens its own `ProjectStore` connection

`rusqlite::Connection` is `!Send` — it cannot be moved across thread boundaries. The solution:

1. Lock the project store briefly to extract `(project_path, source_kind, source_path, cached_fingerprint)`.
2. Release the lock immediately.
3. Pass the `project_path` to the background task, which opens its own `Connection` for writing.

This means no lock is held during the (potentially multi-second) profiling work.

### Fingerprint caching

Before running the adapter, `run_profile` computes `"{file_size}:{mtime_secs}"` for file sources. If this matches the stored fingerprint, profiling is skipped and the job completes immediately with a cached note. This avoids redundant re-profiling of unchanged large files.

## File inventory

| File | Change |
|---|---|
| `src-tauri/src/jobs/mod.rs` | New — `JobManager`, `JobStatus`, lifecycle methods |
| `src-tauri/src/lib.rs` | Added `jobs: Arc<JobManager>` to `AppState` |
| `src-tauri/src/commands/profiling.rs` | `profile_source` made async, spawn_blocking |
| `src-tauri/src/commands/jobs.rs` | New — `list_jobs`, `get_job` |
| `src-tauri/src/commands/mod.rs` | Added `pub mod jobs` |
| `src/hooks/useJobs.ts` | New — subscribes to `job:update` events |
| `src/hooks/useSourceProfile.ts` | Added `watchSourceId`, `profile:updated` listener |
| `src/features/jobs/JobsIndicator.tsx` | New — status-bar widget with popover |
| `src/app/StatusBar.tsx` | Added `<JobsIndicator />` to right slot |
| `src/app/DetailsPanel.tsx` | Passes `source.id` as `watchSourceId` |

## Event flow

```
User clicks "Profile"
  → profileSource(sourceId) [hook]
    → invoke("profile_source") [IPC]
      → create job, emit job:update {status: "queued"}
      → spawn async task
        → spawn_blocking(run_profile)
          → emit job:update {status: "running"}
          → adapter runs (may take seconds)
          → save_source_profile(...)
          → emit job:update {status: "completed"}
          → emit profile:updated {sourceId}
            → useSourceProfile listener fires
              → invoke("get_source_profile") → setProfile(...)
                → ProfilePanel re-renders with data
```

## `JobStatus` shape

```typescript
interface JobStatus {
  id: string;           // UUID
  kind: string;         // e.g. "profile_source"
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  message: string | null;
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}
```

## Known limitations / deferred

- Jobs are in-memory only — lost on app restart. A `source_jobs` table could persist them in Phase 5+.
- No cancellation mechanism yet (`canceled` status is modeled but no cancel endpoint exists).
- `JobsIndicator` shows up to 8 recent jobs. Older jobs are silently dropped from the view (not from memory).
