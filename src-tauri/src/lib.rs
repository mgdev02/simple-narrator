mod audio;
mod commands;
mod dev_log;
mod lang;
mod pdf;
mod piper;
mod text;
mod translate;
mod voices;

use std::collections::HashMap;
use std::sync::Mutex;

use commands::{
    close_pdf, dev_log, detect_language, download_voice_command, extract_pdf_page, generate_audio,
    list_voice_states_command, open_pdf, pick_pdf_file, prepare_page_text, preload_pdf,
    preview_voice, translate_text_command,
};
use pdf::PdfStore;
use tauri::Emitter;

#[cfg(desktop)]
fn setup_app_menu(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem, Submenu};

    let handle = app.handle();
    let menu = Menu::default(handle)?;
    let voices_item = MenuItem::with_id(
        handle,
        "open-voice-catalog",
        "Gestionar voces Piper…",
        true,
        None::<&str>,
    )?;
    let voices_submenu = Submenu::with_items(handle, "Voces", true, &[&voices_item])?;
    menu.append(&voices_submenu)?;
    let _ = app.set_menu(menu);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
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
            list_voice_states_command,
            download_voice_command,
            dev_log
        ]);

    #[cfg(desktop)]
    let builder = builder
        .setup(|app| {
            setup_app_menu(app).map_err(|e| e.to_string())?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "open-voice-catalog" {
                let _ = app.emit("open-voice-catalog", ());
            }
        });

  builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
