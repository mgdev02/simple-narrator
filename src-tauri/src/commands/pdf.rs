use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::dev_log::dev_log;
use crate::pdf::{
    close_pdf as cache_close_pdf,
    extract_page,
    open_pdf as cache_open_pdf,
    preload_pdf as cache_preload_pdf,
    PdfStore,
};

#[derive(Debug, Serialize)]
pub struct PdfMetadataResult {
    pub path: String,
    pub page_count: usize,
    pub file_size_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct PdfPageTextResult {
    pub path: String,
    pub display_page: usize,
    pub pdf_page_number: u32,
    pub text: String,
    pub character_count: usize,
    pub word_count: usize,
}

#[tauri::command]
pub async fn pick_pdf_file(app: AppHandle) -> Result<Option<String>, String> {
    let app_handle = app.clone();

    Ok(
        tauri::async_runtime::spawn_blocking(move || {
            app_handle
                .dialog()
                .file()
                .add_filter("PDF", &["pdf"])
                .set_title("Seleccionar documento PDF")
                .blocking_pick_file()
                .map(|p| p.to_string())
        })
        .await
        .map_err(|e| format!("Diálogo de archivos interrumpido: {e}"))?,
    )
}

#[tauri::command]
pub async fn open_pdf(path: String, app: AppHandle) -> Result<PdfMetadataResult, String> {
    dev_log("pdf", format!("open_pdf start | path={path}"));
    let path_buf = path.clone();
    let app_handle = app.clone();

    let metadata = tauri::async_runtime::spawn_blocking(move || {
        let store = app_handle.state::<PdfStore>();
        cache_open_pdf(Path::new(&path_buf), store.inner()).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Apertura del PDF interrumpida: {e}"))??;

    let result = PdfMetadataResult {
        path,
        page_count: metadata.page_count,
        file_size_bytes: metadata.file_size_bytes,
    };
    dev_log(
        "pdf",
        format!(
            "open_pdf ok | pages={} size={}",
            result.page_count, result.file_size_bytes
        ),
    );
    Ok(result)
}

#[tauri::command]
pub async fn preload_pdf(path: String, app: AppHandle) -> Result<usize, String> {
    let path_buf = path.clone();
    let app_handle = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let store = app_handle.state::<PdfStore>();
        cache_preload_pdf(Path::new(&path_buf), store.inner()).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Precarga del PDF interrumpida: {e}"))?
}

#[tauri::command]
pub async fn extract_pdf_page(
    path: String,
    display_page: usize,
    app: AppHandle,
) -> Result<PdfPageTextResult, String> {
    if display_page == 0 {
        return Err("El número de página debe ser mayor que 0.".to_string());
    }

    dev_log(
        "pdf",
        format!("extract_pdf_page start | page={display_page} path={path}"),
    );

    let path_buf = path.clone();
    let app_handle = app.clone();

    let content = tauri::async_runtime::spawn_blocking(move || {
        let store = app_handle.state::<PdfStore>();
        extract_page(Path::new(&path_buf), display_page, store.inner())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Extracción de página interrumpida: {e}"))??;

    let result = PdfPageTextResult {
        path,
        display_page,
        pdf_page_number: content.pdf_page_number,
        text: content.text,
        character_count: content.character_count,
        word_count: content.word_count,
    };
    dev_log(
        "pdf",
        format!(
            "extract_pdf_page ok | page={} words={}",
            result.display_page, result.word_count
        ),
    );
    Ok(result)
}

#[tauri::command]
pub async fn close_pdf(path: String, app: AppHandle) -> Result<(), String> {
    let path_buf = path.clone();
    let app_handle = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let store = app_handle.state::<PdfStore>();
        cache_close_pdf(Path::new(&path_buf), store.inner()).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Cierre del PDF interrumpido: {e}"))?
}
