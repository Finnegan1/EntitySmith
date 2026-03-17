pub mod adapters;
pub mod commands;
pub mod domain;
pub mod export;
pub mod jobs;
pub mod project_store;
pub mod proposals;

/// Shared application state injected into Tauri commands via `tauri::State`.
///
/// `project` is wrapped in `Mutex<Option<...>>` because:
/// - `rusqlite::Connection` is not `Send`, so it must live behind a `Mutex`.
/// - `Option` represents "no project open" cleanly without a sentinel value.
/// - `std::sync::Mutex` (not `tokio`) is intentional: SQLite operations are
///   fast and synchronous; we never hold this lock across an `.await` point.
///
/// `jobs` is an `Arc<JobManager>` so spawned background threads can update
/// job state independently of the project lock.
pub struct AppState {
    pub project: std::sync::Mutex<Option<project_store::ProjectStore>>,
    pub jobs: std::sync::Arc<jobs::JobManager>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        project: std::sync::Mutex::new(None),
        jobs: std::sync::Arc::new(jobs::JobManager::new()),
    };

    let mut builder = tauri::Builder::default();

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .manage(state)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::system::ping,
            commands::project::create_project,
            commands::project::open_project,
            commands::project::close_project,
            commands::project::get_project_state,
            commands::sources::add_source,
            commands::sources::remove_source,
            commands::sources::list_sources,
            commands::sources::source_capabilities,
            commands::profiling::profile_source,
            commands::profiling::get_source_profile,
            commands::profiling::get_source_profile_summary,
            commands::jobs::list_jobs,
            commands::jobs::get_job,
            commands::proposals::generate_proposals_cmd,
            commands::proposals::list_proposals,
            commands::proposals::review_proposal,
            commands::schema_graph::create_entity_type,
            commands::schema_graph::delete_entity_type,
            commands::schema_graph::get_schema_graph,
            commands::schema_graph::add_relationship,
            commands::schema_graph::update_relationship,
            commands::schema_graph::delete_relationship,
            commands::schema_graph::bind_source_entity,
            commands::schema_graph::unbind_source_entity,
            commands::schema_graph::list_source_entities_summary,
            commands::schema_graph::promote_proposal,
            commands::schema_graph::reset_proposal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
