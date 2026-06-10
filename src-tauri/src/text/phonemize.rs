use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct PhonemizeLine {
    phonemes: Option<Vec<String>>,
}

/// Fonemiza con piper_phonemize (mismo pipeline espeak-ng que Piper).
pub fn phonemize_text(
    phonemize_bin: &Path,
    espeak_data: &Path,
    espeak_voice: &str,
    text: &str,
) -> Result<Vec<String>, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let lib_dir = phonemize_bin
        .parent()
        .map(|dir| dir.join("lib"))
        .filter(|p| p.is_dir());

    let json_line = serde_json::json!({ "text": trimmed }).to_string();

    let mut cmd = Command::new(phonemize_bin);
    cmd.arg("-l")
        .arg(espeak_voice)
        .arg("--espeak_data")
        .arg(espeak_data)
        .arg("-j")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(bin_dir) = phonemize_bin.parent() {
        cmd.current_dir(bin_dir);
    }

    #[cfg(target_os = "macos")]
    if let Some(lib) = lib_dir {
        if let Ok(canonical) = lib.canonicalize() {
            cmd.env("DYLD_LIBRARY_PATH", canonical);
        }
    }

    #[cfg(target_os = "linux")]
    if let Some(lib) = lib_dir {
        cmd.env("LD_LIBRARY_PATH", lib);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("No se pudo ejecutar piper_phonemize: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(json_line.as_bytes())
            .map_err(|e| format!("No se pudo enviar texto a piper_phonemize: {e}"))?;
        stdin
            .write_all(b"\n")
            .map_err(|e| format!("No se pudo finalizar stdin de piper_phonemize: {e}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("piper_phonemize no respondió: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "piper_phonemize falló (código {:?}): {stderr}",
            output.status.code()
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let line = stdout.lines().next().unwrap_or("").trim();
    if line.is_empty() {
        return Err("piper_phonemize no devolvió fonemas.".to_string());
    }

    let parsed: PhonemizeLine = serde_json::from_str(line)
        .map_err(|e| format!("Respuesta JSON inválida de piper_phonemize: {e}"))?;

    Ok(parsed.phonemes.unwrap_or_default())
}

pub fn resolve_espeak_data(phonemize_bin: &Path) -> PathBuf {
    phonemize_bin
        .parent()
        .map(|dir| dir.join("espeak-ng-data"))
        .unwrap_or_else(|| PathBuf::from("espeak-ng-data"))
}
