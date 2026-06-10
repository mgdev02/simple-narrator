mod cache;

pub use cache::{close_pdf, extract_page, open_pdf, preload_pdf, PdfStore};

#[derive(Debug)]
pub enum PdfError {
    Io(std::io::Error),
    Extract(String),
    InvalidPath,
}

impl std::fmt::Display for PdfError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PdfError::Io(e) => write!(f, "Error de lectura: {e}"),
            PdfError::Extract(msg) => write!(f, "Error al extraer texto: {msg}"),
            PdfError::InvalidPath => write!(f, "Ruta de archivo inválida"),
        }
    }
}

impl From<std::io::Error> for PdfError {
    fn from(value: std::io::Error) -> Self {
        PdfError::Io(value)
    }
}

pub(crate) fn normalize_page_text(text: &str) -> String {
    let collapsed = text
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    collapsed.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn extract_page_requires_open_pdf() {
        let store = PdfStore(std::sync::Mutex::new(std::collections::HashMap::new()));
        let missing = PathBuf::from("/tmp/simple-narrator-missing.pdf");
        let result = extract_page(&missing, 1, &store);
        assert!(result.is_err());
    }
}
