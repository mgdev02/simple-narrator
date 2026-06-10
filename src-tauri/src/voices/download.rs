use std::path::{Path, PathBuf};
use std::process::Command;

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

use crate::piper::{
    is_model_patched, resolve_model_path, resolve_models_dir, resolve_piper_python,
};

use super::catalog::catalog_entry_for_stem;

const HF_BASE: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/main";
const VOICE_DOWNLOAD_PROGRESS_EVENT: &str = "voice-download-progress";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceDownloadProgress {
    pub model_stem: String,
    pub phase: String,
    pub percent: u8,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceInstallState {
    pub model_stem: String,
    pub installed: bool,
    pub patched: bool,
}

pub fn list_voice_states(app: &AppHandle) -> Result<Vec<VoiceInstallState>, String> {
    let models_dir = resolve_models_dir(app)?;

    Ok(super::catalog::voice_catalog()?
        .into_iter()
        .map(|entry| {
            let onnx = models_dir.join(format!("{}.onnx", entry.model_stem));
            let installed = onnx.is_file();
            let patched = installed && is_model_patched(&onnx);
            VoiceInstallState {
                model_stem: entry.model_stem,
                installed,
                patched,
            }
        })
        .collect())
}

pub async fn download_voice_model(app: &AppHandle, model_stem: &str) -> Result<(), String> {
    let entry = catalog_entry_for_stem(model_stem)?;
    let models_dir = resolve_models_dir(app)?;

    emit_progress(app, &entry.model_stem, "onnx", 0);
    let onnx_dest = models_dir.join(format!("{}.onnx", entry.model_stem));
    let onnx_url = format!(
        "{HF_BASE}/{hf}/{stem}.onnx",
        hf = entry.hf_path,
        stem = entry.model_stem
    );
    download_file(app, &entry.model_stem, "onnx", &onnx_url, &onnx_dest).await?;

    emit_progress(app, &entry.model_stem, "config", 50);
    let json_dest = models_dir.join(format!("{}.onnx.json", entry.model_stem));
    let json_url = format!(
        "{HF_BASE}/{hf}/{stem}.onnx.json",
        hf = entry.hf_path,
        stem = entry.model_stem
    );
    download_file(app, &entry.model_stem, "config", &json_url, &json_dest).await?;

    let patched_path = patched_marker_path(&onnx_dest);
    if patched_path.is_file() {
        std::fs::remove_file(&patched_path)
            .map_err(|e| format!("No se pudo limpiar el marcador de parche: {e}"))?;
    }

    emit_progress(app, &entry.model_stem, "patch", 90);
    patch_models_dir(&models_dir)?;

    if !resolve_model_path(&models_dir, &entry.model_stem).is_ok() {
        return Err("La voz se descargó pero no se pudo validar en disco.".to_string());
    }

    let onnx = models_dir.join(format!("{}.onnx", entry.model_stem));
    if !is_model_patched(&onnx) {
        return Err(
            "La voz se descargó pero no se pudo parchear para sincronización. \
             Ejecuta scripts/setup-local-ai.sh (venv piper-tts)."
                .to_string(),
        );
    }

    emit_progress(app, &entry.model_stem, "done", 100);
    Ok(())
}

pub fn patch_models_dir(models_dir: &Path) -> Result<(), String> {
    let python = resolve_piper_python().ok_or_else(|| {
        "Entorno piper-tts no encontrado. Ejecuta scripts/setup-local-ai.sh.".to_string()
    })?;

    let script = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../scripts/patch_piper_models.py");
    if !script.is_file() {
        return Err(format!("Script de parche no encontrado: {}", script.display()));
    }

    let output = Command::new(python)
        .arg(&script)
        .arg(models_dir)
        .output()
        .map_err(|e| format!("No se pudo ejecutar el parche ONNX: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "Parche ONNX falló.\n{stdout}\n{stderr}"
        ));
    }

    Ok(())
}

fn patched_marker_path(model_path: &Path) -> PathBuf {
    let name = model_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "model.onnx".to_string());
    model_path.with_file_name(format!("{name}.patched"))
}

async fn download_file(
    app: &AppHandle,
    model_stem: &str,
    phase: &str,
    url: &str,
    dest: &Path,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("simple-narrator")
        .build()
        .map_err(|e| format!("Cliente HTTP: {e}"))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Descarga fallida ({url}): {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Descarga fallida ({url}): HTTP {}",
            response.status()
        ));
    }

    let total = response.content_length();
    let mut stream = response.bytes_stream();
    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| format!("No se pudo crear {}: {e}", dest.display()))?;

    let mut downloaded = 0u64;
    let mut last_emitted = 0u8;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Error leyendo descarga: {e}"))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Error escribiendo archivo: {e}"))?;
        downloaded += chunk.len() as u64;

        if let Some(total_bytes) = total {
            if total_bytes > 0 {
                let file_percent = ((downloaded * 100) / total_bytes) as u8;
                let mapped = match phase {
                    "onnx" => file_percent / 2,
                    "config" => 50 + file_percent / 2,
                    _ => file_percent,
                };
                if mapped >= last_emitted + 5 || mapped == 100 {
                    last_emitted = mapped;
                    emit_progress(app, model_stem, phase, mapped);
                }
            }
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Error finalizando archivo: {e}"))?;

    Ok(())
}

fn emit_progress(app: &AppHandle, model_stem: &str, phase: &str, percent: u8) {
    let _ = app.emit(
        VOICE_DOWNLOAD_PROGRESS_EVENT,
        VoiceDownloadProgress {
            model_stem: model_stem.to_string(),
            phase: phase.to_string(),
            percent,
        },
    );
}
