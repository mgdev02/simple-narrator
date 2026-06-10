mod dev;
mod lang;
mod pdf;
mod prepare;
mod tts;
mod voices;

pub use dev::dev_log;
pub use lang::{detect_language, translate_text_command};
pub use pdf::{close_pdf, extract_pdf_page, open_pdf, pick_pdf_file, preload_pdf};
pub use prepare::prepare_page_text;
pub use tts::{generate_audio, preview_voice};
pub use voices::{download_voice_command, list_voice_states_command};
