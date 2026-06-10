use tauri::AppHandle;

use crate::voices::{download_voice_model, list_voice_states, VoiceInstallState};

#[tauri::command]
pub fn list_voice_states_command(app: AppHandle) -> Result<Vec<VoiceInstallState>, String> {
    list_voice_states(&app)
}

#[tauri::command]
pub async fn download_voice_command(app: AppHandle, model_stem: String) -> Result<(), String> {
    download_voice_model(&app, &model_stem).await
}
