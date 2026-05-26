mod claude_code;
mod google;

use claude_code::{cc_list_projects, cc_mavis_brain, cc_project_detail, cc_status};
use google::{google_disconnect, google_exchange_code, google_fetch_meetings, google_is_connected};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_oauth::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            google_is_connected,
            google_exchange_code,
            google_fetch_meetings,
            google_disconnect,
            cc_list_projects,
            cc_project_detail,
            cc_mavis_brain,
            cc_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
