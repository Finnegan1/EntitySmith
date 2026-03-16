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
pub struct AppState {
    pub project: std::sync::Mutex<Option<project_store::ProjectStore>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        project: std::sync::Mutex::new(None),
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
