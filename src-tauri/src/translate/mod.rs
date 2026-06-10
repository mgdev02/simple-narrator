use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use crate::lang::AppLanguage;

fn project_venv_python() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join(".venv-translate")
        .join("bin")
        .join("python3")
}

fn translate_script_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("scripts")
        .join("translate.py")
}

fn resolve_python() -> Result<PathBuf, String> {
    let venv_python = project_venv_python();
    if venv_python.is_file() {
        return Ok(venv_python);
    }

    if let Ok(path) = which_python("python3") {
        return Ok(path);
    }

    Err(
        "Traducción offline no configurada. Ejecuta scripts/setup-local-ai.sh \
         para instalar Argos Translate (en↔es).".to_string(),
    )
}

fn which_python(name: &str) -> Result<PathBuf, String> {
    let output = Command::new(name)
        .arg("--version")
        .output()
        .map_err(|e| format!("Python no encontrado ({name}): {e}"))?;

    if !output.status.success() {
        return Err(format!("Python ({name}) no está disponible."));
    }

    Ok(PathBuf::from(name))
}

pub fn translate_text(
    text: &str,
    from: AppLanguage,
    to: AppLanguage,
) -> Result<String, String> {
    if from == to {
        return Ok(text.to_string());
    }

    if text.trim().is_empty() {
        return Ok(String::new());
    }

    let python = resolve_python()?;
    let script = translate_script_path();
    if !script.is_file() {
        return Err(format!(
            "Script de traducción no encontrado: {}",
            script.display()
        ));
    }

    let mut child = Command::new(&python)
        .arg(&script)
        .arg(from.code())
        .arg(to.code())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No se pudo ejecutar traducción: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(text.as_bytes())
            .map_err(|e| format!("No se pudo enviar texto a traducir: {e}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Traducción no respondió: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Traducción falló (código {:?}).\n{stderr}",
            output.status.code()
        ));
    }

    let translated = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if translated.is_empty() {
        return Err("La traducción devolvió texto vacío.".to_string());
    }

    Ok(translated)
}
