mod audio;
mod commands;
mod dev_log;
mod lang;
mod pdf;
mod piper;
mod text;
mod translate;

use std::collections::HashMap;
use std::sync::Mutex;

use commands::{
    close_pdf, dev_log, detect_language, extract_pdf_page, generate_audio, open_pdf,
    pick_pdf_file, prepare_page_text, preload_pdf, preview_voice, translate_text_command,
};
use pdf::PdfStore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(PdfStore(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            pick_pdf_file,
            open_pdf,
            preload_pdf,
            extract_pdf_page,
            prepare_page_text,
            close_pdf,
            detect_language,
            translate_text_command,
            generate_audio,
            preview_voice,
            dev_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
