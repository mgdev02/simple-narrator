use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use pdf_extract::{output_doc_page, Document, PlainTextOutput};

use super::{normalize_page_text, PdfError};

pub struct PdfStore(pub Mutex<HashMap<String, CachedPdf>>);

pub struct CachedPdf {
    pub doc: Option<Document>,
    pub page_order: Option<Vec<u32>>,
}

#[derive(Debug)]
pub struct PdfMetadata {
    pub page_count: usize,
    pub file_size_bytes: u64,
}

#[derive(Debug)]
pub struct PageTextContent {
    pub text: String,
    pub character_count: usize,
    pub word_count: usize,
    pub pdf_page_number: u32,
}

pub fn open_pdf(path: &Path, store: &PdfStore) -> Result<PdfMetadata, PdfError> {
    if !path.is_file() {
        return Err(PdfError::InvalidPath);
    }

    let file_size_bytes = std::fs::metadata(path)?.len();
    let key = path.to_string_lossy().to_string();

    store
        .0
        .lock()
        .map_err(|e| PdfError::Extract(format!("Cache PDF bloqueada: {e}")))?
        .insert(
            key,
            CachedPdf {
                doc: None,
                page_order: None,
            },
        );

    Ok(PdfMetadata {
        page_count: 0,
        file_size_bytes,
    })
}

fn load_document(cached: &mut CachedPdf, path: &Path) -> Result<(), PdfError> {
    if cached.doc.is_some() && cached.page_order.is_some() {
        return Ok(());
    }

    let mut doc = Document::load(path).map_err(|e| PdfError::Extract(e.to_string()))?;

    if doc.is_encrypted() {
        doc.decrypt("")
            .map_err(|e| PdfError::Extract(format!("PDF protegido con contraseña: {e}")))?;
    }

    let pages_map = doc.get_pages();
    let mut page_order: Vec<u32> = pages_map.keys().copied().collect();
    page_order.sort_unstable();

    if page_order.is_empty() {
        return Err(PdfError::Extract(
            "El PDF no contiene páginas legibles.".to_string(),
        ));
    }

    cached.doc = Some(doc);
    cached.page_order = Some(page_order);
    Ok(())
}

pub fn preload_pdf(path: &Path, store: &PdfStore) -> Result<usize, PdfError> {
    let key = path.to_string_lossy().to_string();
    let mut guard = store
        .0
        .lock()
        .map_err(|e| PdfError::Extract(format!("Cache PDF bloqueada: {e}")))?;

    let cached = guard
        .get_mut(&key)
        .ok_or_else(|| PdfError::Extract("Abre el PDF antes de precargar.".to_string()))?;

    load_document(cached, path)?;

    Ok(cached.page_order.as_ref().map(|p| p.len()).unwrap_or(0))
}

pub fn extract_page(
    path: &Path,
    display_page: usize,
    store: &PdfStore,
) -> Result<PageTextContent, PdfError> {
    let key = path.to_string_lossy().to_string();
    let mut guard = store
        .0
        .lock()
        .map_err(|e| PdfError::Extract(format!("Cache PDF bloqueada: {e}")))?;

    let cached = guard
        .get_mut(&key)
        .ok_or_else(|| PdfError::Extract("Abre el PDF antes de extraer páginas.".to_string()))?;

    load_document(cached, path)?;

    let page_order = cached
        .page_order
        .as_ref()
        .expect("page_order set after load_document");

    let pdf_page_number = page_order
        .get(display_page.saturating_sub(1))
        .copied()
        .ok_or_else(|| PdfError::Extract(format!("Página {display_page} no existe.")))?;

    let doc = cached
        .doc
        .as_ref()
        .expect("doc set after load_document");

    let mut raw_page_text = String::new();
    let mut output = PlainTextOutput::new(&mut raw_page_text);

    output_doc_page(doc, &mut output, pdf_page_number)
        .map_err(|e| PdfError::Extract(format!("Página {display_page}: {e}")))?;

    let text = normalize_page_text(&raw_page_text);
    let character_count = text.chars().count();
    let word_count = text
        .split_whitespace()
        .filter(|w| !w.is_empty())
        .count();

    Ok(PageTextContent {
        text,
        character_count,
        word_count,
        pdf_page_number,
    })
}

pub fn close_pdf(path: &Path, store: &PdfStore) -> Result<(), PdfError> {
    let key = path.to_string_lossy().to_string();
    let mut guard = store
        .0
        .lock()
        .map_err(|e| PdfError::Extract(format!("Cache PDF bloqueada: {e}")))?;
    guard.remove(&key);
    Ok(())
}
