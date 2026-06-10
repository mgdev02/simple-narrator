use std::path::{Path, PathBuf};

use serde::Deserialize;
use tauri::{AppHandle, Manager};

/// Modelos Piper en `models/piper/` (`.onnx` + `.onnx.json`):
/// - Español: `es_ES-sharvard-medium`
/// - Inglés: `en_US-lessac-medium`
pub const MODEL_STEM_ES: &str = "es_ES-sharvard-medium";
pub const MODEL_STEM_EN: &str = "en_US-lessac-medium";

pub fn model_stem_for_language(language: &str) -> Result<&'static str, String> {
    match language.trim().to_lowercase().as_str() {
        "es" | "spa" => Ok(MODEL_STEM_ES),
        "en" | "eng" => Ok(MODEL_STEM_EN),
        _ => Err(format!(
            "Idioma TTS no soportado: {language}. Usa 'es' o 'en'."
        )),
    }
}

pub fn resolve_model_stem(model_stem: &str) -> Result<String, String> {
    let stem = model_stem.trim();
    if stem.is_empty() {
        return Err("El modelo de voz no puede estar vacío.".to_string());
    }
    if stem.contains('/') || stem.contains('\\') {
        return Err("Nombre de modelo inválido.".to_string());
    }
    Ok(stem.to_string())
}

fn piper_executable_name() -> &'static str {
    if cfg!(windows) {
        "piper.exe"
    } else {
        "piper"
    }
}

fn piper_phonemize_executable_name() -> &'static str {
    if cfg!(windows) {
        "piper_phonemize.exe"
    } else {
        "piper_phonemize"
    }
}

#[derive(Debug, Deserialize)]
struct PiperModelConfig {
    espeak: Option<PiperEspeakConfig>,
}

#[derive(Debug, Deserialize)]
struct PiperEspeakConfig {
    voice: Option<String>,
}

/// Voz espeak-ng del modelo Piper (`es`, `en-us`, …).
pub fn espeak_voice_for_model(models_dir: &Path, model_stem: &str) -> Result<String, String> {
    let config_path = models_dir.join(format!("{model_stem}.onnx.json"));
    let raw = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("No se pudo leer {}: {e}", config_path.display()))?;
    let parsed: PiperModelConfig = serde_json::from_str(&raw)
        .map_err(|e| format!("JSON de modelo inválido: {e}"))?;

    if let Some(voice) = parsed.espeak.and_then(|e| e.voice) {
        let trimmed = voice.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }

    Err(format!(
        "No se encontró espeak.voice en {}",
        config_path.display()
    ))
}

/// Desarrollo: `src-tauri/bin/piper`
/// Producción: sidecar junto al ejecutable (`piper-<target-triple>` vía `externalBin`).
pub fn resolve_piper_binary(app: &AppHandle) -> Result<PathBuf, String> {
    let manifest_bin = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("bin")
        .join(piper_executable_name());

    if manifest_bin.is_file() {
        return Ok(manifest_bin);
    }

    if let Some(exe_dir) = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .map(|p| p.to_path_buf())
    {
        if let Some(sidecar) = find_bundled_sidecar(&exe_dir) {
            return Ok(sidecar);
        }

        let plain = exe_dir.join(piper_executable_name());
        if plain.is_file() {
            return Ok(plain);
        }
    }

  // Fallback: resolver vía Tauri (útil si el binario se empaqueta como recurso).
    if let Ok(path) = app
        .path()
        .resolve(
            format!("bin/{}", piper_executable_name()),
            tauri::path::BaseDirectory::Resource,
        )
    {
        if path.is_file() {
            return Ok(path);
        }
    }

    Err(format!(
        "Binario Piper no encontrado. Coloca el ejecutable en src-tauri/bin/{} \
         o configura bundle.externalBin en tauri.conf.json.",
        piper_executable_name()
    ))
}

/// `src-tauri/bin/piper_phonemize` (instalado por scripts/setup-local-ai.sh).
pub fn resolve_piper_phonemize_binary(app: &AppHandle) -> Result<PathBuf, String> {
    let manifest_bin = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("bin")
        .join(piper_phonemize_executable_name());

    if manifest_bin.is_file() {
        return Ok(manifest_bin);
    }

    if let Some(exe_dir) = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .map(|p| p.to_path_buf())
    {
        let bundled = exe_dir.join(piper_phonemize_executable_name());
        if bundled.is_file() {
            return Ok(bundled);
        }
    }

    if let Ok(path) = app.path().resolve(
        format!("bin/{}", piper_phonemize_executable_name()),
        tauri::path::BaseDirectory::Resource,
    ) {
        if path.is_file() {
            return Ok(path);
        }
    }

    Err(
        "Binario piper_phonemize no encontrado. Ejecuta scripts/setup-local-ai.sh para instalarlo."
            .to_string(),
    )
}

/// Desarrollo: `src-tauri/models/piper/`
/// Producción: `<resource_dir>/models/piper/` (vía `bundle.resources`).
pub fn resolve_models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let manifest_models =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("models").join("piper");

    if manifest_models.is_dir() {
        return Ok(manifest_models);
    }

    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("models").join("piper");
        if bundled.is_dir() {
            return Ok(bundled);
        }
    }

    Err(
        "Directorio de modelos Piper no encontrado. Coloca los archivos .onnx en \
         src-tauri/models/piper/ o configura bundle.resources en tauri.conf.json."
            .to_string(),
    )
}

pub fn resolve_model_path(models_dir: &Path, model_stem: &str) -> Result<PathBuf, String> {
    let onnx = models_dir.join(format!("{model_stem}.onnx"));
    if !onnx.is_file() {
        return Err(format!(
            "Modelo no encontrado: {}. Descarga el .onnx y su .onnx.json de Piper.",
            onnx.display()
        ));
    }

    let config = models_dir.join(format!("{model_stem}.onnx.json"));
    if !config.is_file() {
        return Err(format!(
            "Configuración del modelo no encontrada: {}. Piper requiere el archivo .onnx.json.",
            config.display()
        ));
    }

    Ok(onnx)
}

fn find_bundled_sidecar(exe_dir: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(exe_dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();
        if name.starts_with("piper-") {
            return Some(path);
        }
    }
    None
}
