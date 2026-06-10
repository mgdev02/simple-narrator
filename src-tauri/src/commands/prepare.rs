use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::dev_log::dev_log;
use crate::lang::{detect_language, AppLanguage};
use crate::pdf::{extract_page, PdfStore};
use crate::text::chunk_text_for_playback;

#[derive(Debug, Serialize)]
pub struct PreparePageTextResult {
    pub path: String,
    pub display_page: usize,
    pub detected_language: String,
    pub translated: bool,
    pub chunks: Vec<String>,
    pub highlight_chunks: Vec<String>,
    /// Texto en el idioma del PDF, troceado para subtítulos y resaltado.
    pub source_chunks: Vec<String>,
}

#[tauri::command]
pub async fn prepare_page_text(
    path: String,
    display_page: usize,
    listen_language: String,
    app: AppHandle,
) -> Result<PreparePageTextResult, String> {
    if display_page == 0 {
        return Err("El número de página debe ser mayor que 0.".to_string());
    }

    dev_log(
        "prep",
        format!(
            "prepare_page_text start | page={display_page} listen={listen_language}"
        ),
    );

    let listen = AppLanguage::from_code(&listen_language).ok_or_else(|| {
        format!("Idioma de lectura no soportado: {listen_language}. Usa 'es' o 'en'.")
    })?;

    let path_buf = path.clone();
    let app_handle = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let store = app_handle.state::<PdfStore>();
        let content = extract_page(Path::new(&path_buf), display_page, store.inner())
            .map_err(|e| e.to_string())?;

        let original = content.text.trim();
        if original.is_empty() {
            return Err("La página no contiene texto legible.".to_string());
        }

        let detected = detect_language(original)
            .or(Some(listen))
            .expect("listen language is always valid");

        let translated = detected != listen;
        let source_chunks = chunk_text_for_playback(original);
        if source_chunks.is_empty() {
            return Err("No hay texto válido para sintetizar.".to_string());
        }

        // Traducción por fragmento en el frontend: solo extraemos y troceamos aquí.
        let chunks = if translated {
            Vec::new()
        } else {
            source_chunks.clone()
        };

        let highlight_chunks = source_chunks.clone();

        let result = PreparePageTextResult {
            path: path_buf,
            display_page,
            detected_language: detected.code().to_string(),
            translated,
            chunks,
            highlight_chunks,
            source_chunks,
        };
        dev_log(
            "prep",
            format!(
                "prepare_page_text ok | page={} chunks={} translated={}",
                result.display_page,
                result.source_chunks.len(),
                result.translated
            ),
        );
        Ok(result)
    })
    .await
    .map_err(|e| format!("Preparación de página interrumpida: {e}"))?
}
