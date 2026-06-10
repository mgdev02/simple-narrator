use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::AppHandle;

use crate::text::{alignment_sidecar_path, ChunkAlignment};

pub fn resolve_piper_python() -> Option<PathBuf> {
    let venv_python = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join(".venv-piper")
        .join("bin")
        .join("python3");

    if venv_python.is_file() {
        return Some(venv_python);
    }

    None
}

pub fn resolve_synthesize_script() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../scripts/piper_synthesize_align.py")
}

pub fn patched_marker_path(model_path: &Path) -> PathBuf {
    let name = model_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "model.onnx".to_string());
    model_path.with_file_name(format!("{name}.patched"))
}

pub fn is_model_patched(model_path: &Path) -> bool {
    patched_marker_path(model_path).is_file()
}

pub fn synthesize_with_onnx_alignment(
    python: &Path,
    script: &Path,
    model: &Path,
    text: &str,
    output_wav: &Path,
    source_text: Option<&str>,
    espeak_data: &Path,
) -> Result<ChunkAlignment, String> {
    if !is_model_patched(model) {
        return Err("Modelo Piper sin parche de alineación.".to_string());
    }

    let align_path = alignment_sidecar_path(output_wav);

    let mut cmd = Command::new(python);
    cmd.arg(script)
        .arg("--model")
        .arg(model)
        .arg("--text")
        .arg(text)
        .arg("--output")
        .arg(output_wav)
        .arg("--align-json")
        .arg(&align_path);

    if espeak_data.is_dir() {
        cmd.arg("--espeak-data").arg(espeak_data);
    }

    if let Some(source) = source_text {
        let trimmed = source.trim();
        if !trimmed.is_empty() && trimmed != text.trim() {
            cmd.arg("--source-text").arg(trimmed);
        }
    }

    let output = cmd
        .output()
        .map_err(|e| format!("No se pudo ejecutar piper-tts: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let code = output.status.code().unwrap_or(-1);
        if code == 2 {
            return Err("Modelo sin parche ONNX de alineación.".to_string());
        }
        return Err(format!(
            "piper-tts falló (código {code}): {stderr}",
        ));
    }

    if !align_path.is_file() {
        return Err("No se generó el archivo de alineación.".to_string());
    }

    let raw = std::fs::read_to_string(&align_path)
        .map_err(|e| format!("No se pudo leer alineación: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("JSON de alineación inválido: {e}"))
}

pub fn can_use_onnx_alignment(_app: &AppHandle, model: &Path) -> bool {
    resolve_piper_python().is_some() && is_model_patched(model)
}
