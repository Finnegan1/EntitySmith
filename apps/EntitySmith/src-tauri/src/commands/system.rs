use serde::Serialize;

#[derive(Serialize)]
pub struct PingResponse {
    pub status: String,
    pub version: String,
}

#[tauri::command]
pub fn ping() -> PingResponse {
    PingResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}
