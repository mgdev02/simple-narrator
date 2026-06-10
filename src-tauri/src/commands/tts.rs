use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::audio::{is_valid_wav_file, merge_wav_files, wav_duration_ms};
use crate::dev_log::dev_log;
use crate::piper::{
    can_use_onnx_alignment, espeak_voice_for_model, is_model_patched, model_stem_for_language,
    resolve_model_path, resolve_model_stem, resolve_models_dir, resolve_piper_binary,
    resolve_piper_phonemize_binary, resolve_piper_python, resolve_synthesize_script,
    synthesize_with_onnx_alignment, MODEL_STEM_EN, MODEL_STEM_ES,
};
use crate::text::{
    alignment_sidecar_path, build_chunk_alignment, merge_chunk_alignments,
    write_alignment_sidecar, ChunkAlignment, chunk_text, resolve_espeak_data,
    DEFAULT_MAX_CHUNK_CHARS,
};

const TTS_PROGRESS_EVENT: &str = "tts-progress";

/// Una sola instancia de Piper a la vez evita saturar CPU/RAM (crítico en macOS con Rosetta).
static PIPER_MUTEX: Mutex<()> = Mutex::new(());

fn acquire_piper_lock() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    PIPER_MUTEX
        .lock()
        .map_err(|e| format!("No se pudo iniciar Piper: {e}"))
}

#[derive(Clone, Serialize)]
pub struct TtsProgressPayload {
    pub current_chunk: usize,
    pub total_chunks: usize,
    pub progress: u8,
}

#[derive(Debug, Serialize)]
pub struct GenerateAudioResult {
    pub path: String,
    pub chunk_count: usize,
    pub duration_ms: u32,
    pub alignment_path: String,
    pub alignment: ChunkAlignment,
}

fn opposite_language(language: &str) -> &'static str {
    match language.trim().to_lowercase().as_str() {
        "es" | "spa" => "en",
        "en" | "eng" => "es",
        _ => "en",
    }
}

fn resolve_model_with_fallback(
    models_dir: &Path,
    stem: &str,
) -> Result<PathBuf, String> {
    if let Ok(path) = resolve_model_path(models_dir, stem) {
        return Ok(path);
    }

    let fallback = match stem {
        "es_AR-daniela-high" => MODEL_STEM_ES,
        "en_US-amy-medium" | "en_US-ryan-medium" => MODEL_STEM_EN,
        _ => stem,
    };

    resolve_model_path(models_dir, fallback)
}

fn resolve_espeak_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let phonemize_bin = resolve_piper_phonemize_binary(app)?;
    let espeak_data = resolve_espeak_data(&phonemize_bin);
    if !espeak_data.is_dir() {
        return Err(format!(
            "Datos espeak-ng no encontrados en {}",
            espeak_data.display()
        ));
    }
    Ok(espeak_data)
}

fn synthesize_chunk_wav(
    app: &AppHandle,
    binary: &PathBuf,
    model: &PathBuf,
    output: &PathBuf,
    text: &str,
    source_text: Option<&str>,
    models_dir: &Path,
    model_stem: &str,
    language: &str,
) -> Result<ChunkAlignment, String> {
    if let Some(python) = resolve_piper_python() {
        let script = resolve_synthesize_script();
        if script.is_file() && is_model_patched(model) {
            let espeak_data = resolve_espeak_data_dir(app)?;
            match synthesize_with_onnx_alignment(
                &python,
                &script,
                model,
                text,
                output,
                source_text,
                &espeak_data,
            ) {
                Ok(alignment) => return Ok(alignment),
                Err(err) => {
                    eprintln!(
                        "Alineación ONNX no disponible, usando Piper CLI: {err}"
                    );
                }
            }
        }
    }

    run_piper(binary, model, output, text)?;
    write_alignment_for_wav(
        app,
        models_dir,
        model_stem,
        language,
        output,
        text,
        source_text,
    )
    .map(|(_, alignment)| alignment)
}

fn read_alignment_sidecar(path: &Path) -> Result<ChunkAlignment, String> {
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("No se pudo leer alineación {}: {e}", path.display()))?;
    serde_json::from_str(&raw).map_err(|e| format!("JSON de alineación inválido: {e}"))
}

fn write_alignment_for_wav(
    app: &AppHandle,
    models_dir: &Path,
    model_stem: &str,
    language: &str,
    wav_path: &Path,
    tts_text: &str,
    source_text: Option<&str>,
) -> Result<(String, ChunkAlignment), String> {
    let duration_ms = wav_duration_ms(wav_path)?;
    if duration_ms == 0 {
        return Err("Duración de audio inválida para alineación.".to_string());
    }

    let phonemize_bin = resolve_piper_phonemize_binary(app)?;
    let espeak_data = resolve_espeak_data(&phonemize_bin);
    if !espeak_data.is_dir() {
        return Err(format!(
            "Datos espeak-ng no encontrados en {}",
            espeak_data.display()
        ));
    }

    let tts_voice = espeak_voice_for_model(models_dir, model_stem)?;
    let source_voice = if let Some(source) = source_text {
        let trimmed = source.trim();
        if trimmed.is_empty() || trimmed == tts_text.trim() {
            None
        } else {
            let opposite = opposite_language(language);
            let opposite_stem = model_stem_for_language(opposite)?;
            Some(espeak_voice_for_model(models_dir, opposite_stem)?)
        }
    } else {
        None
    };

    let alignment = build_chunk_alignment(
        &phonemize_bin,
        &espeak_data,
        &tts_voice,
        tts_text,
        source_text,
        source_voice.as_deref(),
        duration_ms,
    )?;

    let align_path = write_alignment_sidecar(wav_path, &alignment)?;
    Ok((align_path.to_string_lossy().to_string(), alignment))
}

#[tauri::command]
pub async fn generate_audio(
    app: AppHandle,
    text: String,
    output_path: String,
    language: String,
    model_stem: Option<String>,
    source_text: Option<String>,
) -> Result<GenerateAudioResult, String> {
    if text.trim().is_empty() {
        return Err("El texto está vacío; no hay contenido para sintetizar.".to_string());
    }

    dev_log(
        "tts",
        format!(
            "generate_audio start | lang={language} out={output_path} chars={}",
            text.len()
        ),
    );

    let stem = if let Some(custom) = model_stem {
        resolve_model_stem(&custom)?
    } else {
        model_stem_for_language(&language)?.to_string()
    };

    let binary = resolve_piper_binary(&app)?;
    let models_dir = resolve_models_dir(&app)?;
    let model = resolve_model_with_fallback(&models_dir, &stem)?;
    let output = PathBuf::from(&output_path);
    let chunks = chunk_text(&text, DEFAULT_MAX_CHUNK_CHARS);
    let source_ref = source_text.as_deref();

    if chunks.is_empty() {
        return Err("No hay texto válido para sintetizar.".to_string());
    }

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("No se pudo crear el directorio: {e}"))?;
    }

    if output.is_file() && is_valid_wav_file(&output) {
        let align_path = alignment_sidecar_path(&output);
        let can_onnx = can_use_onnx_alignment(&app, &model);

        if align_path.is_file() {
            let alignment = read_alignment_sidecar(&align_path)?;
            let is_onnx = alignment.alignment_method.as_deref() == Some("onnx_w_ceil");

            if is_onnx || !can_onnx {
                let duration_ms = wav_duration_ms(&output)?;
                dev_log(
                    "tts",
                    format!(
                        "generate_audio cache hit | ms={duration_ms} onnx={is_onnx}"
                    ),
                );
                return Ok(GenerateAudioResult {
                    path: output_path,
                    chunk_count: 1,
                    duration_ms,
                    alignment_path: align_path.to_string_lossy().to_string(),
                    alignment,
                });
            }

            std::fs::remove_file(&output).ok();
            std::fs::remove_file(&align_path).ok();
        } else if !can_onnx {
            let (alignment_path, alignment) = write_alignment_for_wav(
                &app,
                &models_dir,
                &stem,
                &language,
                &output,
                &text,
                source_ref,
            )?;

            return Ok(GenerateAudioResult {
                path: output_path,
                chunk_count: 1,
                duration_ms: wav_duration_ms(&output)?,
                alignment_path,
                alignment,
            });
        } else {
            std::fs::remove_file(&output).ok();
        }
    }

    if output.is_file() {
        std::fs::remove_file(&output).ok();
        std::fs::remove_file(alignment_sidecar_path(&output)).ok();
    }

    let stem_name = output
        .file_stem()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "audio".to_string());
    let chunk_dir = output
        .parent()
        .map(|dir| dir.join(format!("{stem_name}_chunks")))
        .unwrap_or_else(|| PathBuf::from("chunks"));

    let total_chunks = chunks.len();
    let app_handle = app.clone();
    let expected_output = output_path.clone();

    let stem_clone = stem.clone();
    let language_clone = language.clone();
    let full_text = text.clone();
    let source_owned = source_text.clone();
    let models_dir_clone = models_dir.clone();

    let (chunk_count, alignment) = tauri::async_runtime::spawn_blocking(move || {
        synthesize_chunked(
            &app_handle,
            &binary,
            &model,
            &models_dir_clone,
            &stem_clone,
            &language_clone,
            &chunks,
            &chunk_dir,
            &output,
            total_chunks,
            source_owned.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Tarea de síntesis interrumpida: {e}"))??;

    let generated = PathBuf::from(&expected_output);
    if !generated.is_file() {
        return Err(format!(
            "Piper terminó pero no se generó el archivo: {}",
            expected_output
        ));
    }

    let alignment_path = if alignment.alignment_method.as_deref() == Some("onnx_w_ceil") {
        write_alignment_sidecar(&generated, &alignment)?
            .to_string_lossy()
            .to_string()
    } else {
        write_alignment_for_wav(
            &app,
            &models_dir,
            &stem,
            &language,
            &generated,
            &full_text,
            source_ref,
        )?
        .0
    };

    let duration_ms = wav_duration_ms(&generated)?;
    dev_log(
        "tts",
        format!(
            "generate_audio ok | chunks={chunk_count} ms={duration_ms}"
        ),
    );
    Ok(GenerateAudioResult {
        path: expected_output,
        chunk_count,
        duration_ms,
        alignment_path,
        alignment,
    })
}

#[tauri::command]
pub async fn preview_voice(
    app: AppHandle,
    model_stem: String,
    text: String,
) -> Result<String, String> {
    let stem = resolve_model_stem(&model_stem)?;
    let preview_text: String = text.chars().take(160).collect();
    if preview_text.trim().is_empty() {
        return Err("El texto de preescucha está vacío.".to_string());
    }

    let binary = resolve_piper_binary(&app)?;
    let models_dir = resolve_models_dir(&app)?;
    let model = resolve_model_with_fallback(&models_dir, &stem)?;
    let output = std::env::temp_dir().join(format!(
        "simple-narrator-preview-{}-{}.wav",
        stem.replace('/', "_"),
        std::process::id()
    ));

    let binary_path = binary.clone();
    let model_path = model.clone();
    let output_path = output.clone();
    let sample = preview_text.clone();

    tauri::async_runtime::spawn_blocking(move || {
        run_piper(&binary_path, &model_path, &output_path, &sample)?;
        if !output_path.is_file() {
            return Err("Piper no generó el archivo de preescucha.".to_string());
        }
        Ok(output_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Preescucha interrumpida: {e}"))?
}

fn synthesize_chunked(
    app: &AppHandle,
    binary: &PathBuf,
    model: &PathBuf,
    models_dir: &Path,
    model_stem: &str,
    language: &str,
    chunks: &[String],
    chunk_dir: &Path,
    output: &Path,
    total_chunks: usize,
    source_text: Option<&str>,
) -> Result<(usize, ChunkAlignment), String> {
    std::fs::create_dir_all(chunk_dir)
        .map_err(|e| format!("No se pudo crear directorio de chunks: {e}"))?;

    let mut chunk_paths = Vec::with_capacity(total_chunks);
    let mut alignments = Vec::with_capacity(total_chunks);

    for (index, chunk) in chunks.iter().enumerate() {
        let chunk_path = chunk_dir.join(format!("chunk_{:04}.wav", index + 1));
        let alignment = synthesize_chunk_wav(
            app,
            binary,
            model,
            &chunk_path,
            chunk,
            source_text,
            models_dir,
            model_stem,
            language,
        )?;

        if !chunk_path.is_file() {
            return Err(format!(
                "Piper no generó el chunk {} en {}",
                index + 1,
                chunk_path.display()
            ));
        }

        chunk_paths.push(chunk_path);
        alignments.push(alignment);

        let progress = ((index + 1) * 100 / total_chunks) as u8;
        let _ = app.emit(
            TTS_PROGRESS_EVENT,
            TtsProgressPayload {
                current_chunk: index + 1,
                total_chunks,
                progress,
            },
        );
    }

    merge_wav_files(&chunk_paths, output)?;

    for path in &chunk_paths {
        std::fs::remove_file(path).ok();
    }
    std::fs::remove_dir(chunk_dir).ok();

    let merged = merge_chunk_alignments(&alignments);
    Ok((total_chunks, merged))
}

fn configure_piper_process(cmd: &mut Command, binary: &Path) {
    if let Some(bin_dir) = binary.parent() {
        cmd.current_dir(bin_dir);

        let lib_dir = bin_dir.join("lib");
        if lib_dir.is_dir() {
            #[cfg(target_os = "macos")]
            if let Ok(lib_path) = lib_dir.canonicalize() {
                cmd.env("DYLD_LIBRARY_PATH", lib_path);
            }

            #[cfg(target_os = "linux")]
            cmd.env("LD_LIBRARY_PATH", lib_dir);
        }

        let espeak_data = bin_dir.join("espeak-ng-data");
        if espeak_data.is_dir() {
            cmd.env("ESPEAK_DATA_PATH", espeak_data);
        }
    }
}

fn run_piper_unlocked(
    binary: &PathBuf,
    model: &PathBuf,
    output: &PathBuf,
    text: &str,
) -> Result<(), String> {
    let mut cmd = Command::new(binary);
    cmd.arg("--model")
        .arg(model)
        .arg("--output_file")
        .arg(output)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    configure_piper_process(&mut cmd, binary);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("No se pudo ejecutar Piper ({}): {e}", binary.display()))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(text.as_bytes())
            .map_err(|e| format!("No se pudo enviar texto a Piper: {e}"))?;
        stdin
            .write_all(b"\n")
            .map_err(|e| format!("No se pudo finalizar la entrada de Piper: {e}"))?;
    }

    let output_process = child
        .wait_with_output()
        .map_err(|e| format!("Piper no respondió: {e}"))?;

    if !output_process.status.success() {
        let stderr = String::from_utf8_lossy(&output_process.stderr);
        let stdout = String::from_utf8_lossy(&output_process.stdout);
        return Err(format!(
            "Piper falló (código {:?}).\nstderr: {stderr}\nstdout: {stdout}",
            output_process.status.code()
        ));
    }

    Ok(())
}

fn run_piper(
    binary: &PathBuf,
    model: &PathBuf,
    output: &PathBuf,
    text: &str,
) -> Result<(), String> {
    let _piper_guard = acquire_piper_lock()?;
    run_piper_unlocked(binary, model, output, text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn run_piper_rejects_missing_binary() {
        let binary = PathBuf::from("/tmp/simple-narrator-missing-piper");
        let model = PathBuf::from("/tmp/model.onnx");
        let output = PathBuf::from("/tmp/out.wav");
        let result = run_piper_unlocked(&binary, &model, &output, "test");
        assert!(result.is_err());
    }

    #[test]
    fn resolve_model_path_requires_onnx_and_json() {
        let dir = std::env::temp_dir().join("simple-narrator-piper-test");
        std::fs::create_dir_all(&dir).unwrap();
        let stem = "test-model";
        let onnx = dir.join(format!("{stem}.onnx"));
        std::fs::write(&onnx, b"fake").unwrap();

        let missing_json = crate::piper::resolve_model_path(&dir, stem);
        assert!(missing_json.is_err());

        std::fs::write(dir.join(format!("{stem}.onnx.json")), b"{}").unwrap();
        let ok = crate::piper::resolve_model_path(&dir, stem);
        assert!(ok.is_ok());

        std::fs::remove_dir_all(&dir).ok();
    }
}
