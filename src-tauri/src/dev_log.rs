/// Logs de diagnóstico en terminal (`tauri dev`). Sin coste en release.
pub fn dev_log(tag: &str, message: impl AsRef<str>) {
    if cfg!(debug_assertions) {
        eprintln!("[Narrator:{tag}] {}", message.as_ref());
    }
}
