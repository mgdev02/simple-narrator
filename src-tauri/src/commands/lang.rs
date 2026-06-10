use crate::lang::{detect_language as detect_lang, AppLanguage};
use crate::translate::translate_text;

#[tauri::command]
pub async fn detect_language(text: String) -> Result<Option<String>, String> {
    if text.trim().is_empty() {
        return Ok(None);
    }

    let detected = tauri::async_runtime::spawn_blocking(move || detect_lang(&text))
        .await
        .map_err(|e| format!("Detección de idioma interrumpida: {e}"))?;

    Ok(detected.map(|lang| lang.code().to_string()))
}

#[tauri::command]
pub async fn translate_text_command(
    text: String,
    from_language: String,
    to_language: String,
) -> Result<String, String> {
    let from = AppLanguage::from_code(&from_language).ok_or_else(|| {
        format!("Idioma origen no soportado: {from_language}. Usa 'es' o 'en'.")
    })?;
    let to = AppLanguage::from_code(&to_language).ok_or_else(|| {
        format!("Idioma destino no soportado: {to_language}. Usa 'es' o 'en'.")
    })?;

    tauri::async_runtime::spawn_blocking(move || translate_text(&text, from, to))
        .await
        .map_err(|e| format!("Traducción interrumpida: {e}"))?
}
