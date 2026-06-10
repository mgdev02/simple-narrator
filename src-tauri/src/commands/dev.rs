/// Log del frontend a la terminal de `tauri dev` (solo builds de depuración).
#[tauri::command]
pub fn dev_log(tag: String, message: String) {
    if cfg!(debug_assertions) {
        eprintln!("[Narrator:{tag}] {message}");
    }
}
