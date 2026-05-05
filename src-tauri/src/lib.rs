#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Plugin OAuth (jalon 19) — capture le redirect Spotify via un
        // serveur HTTP local éphémère. Frontend : `import { start, onUrl }
        // from '@fabianlars/tauri-plugin-oauth';`
        .plugin(tauri_plugin_oauth::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
