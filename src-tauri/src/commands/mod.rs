mod dev;
mod lang;
mod pdf;
mod prepare;
mod tts;

pub use dev::dev_log;
pub use lang::{detect_language, translate_text_command};
pub use pdf::{close_pdf, extract_pdf_page, open_pdf, pick_pdf_file, preload_pdf};
pub use prepare::prepare_page_text;
pub use tts::{generate_audio, preview_voice};
