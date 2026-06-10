fn main() {
    tauri_build::build();

    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let voice_catalog = manifest_dir.join("voice-catalog.json");
    if voice_catalog.is_file() {
        println!("cargo:rerun-if-changed={}", voice_catalog.display());
    }
    for rel in [
        "icons/icon.icns",
        "icons/icon.ico",
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.png",
    ] {
        let path = manifest_dir.join(rel);
        if path.is_file() {
            println!("cargo:rerun-if-changed={}", path.display());
        }
    }
}
