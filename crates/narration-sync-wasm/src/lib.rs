use narration_sync::{
    active_word_index, compute_word_sync_state, source_word_timings, spoken_char_count_arrays,
    spoken_word_count, subtitle_timings_for_text, ChunkAlignment,
};
use wasm_bindgen::prelude::*;

fn parse_alignment(json: &str) -> Result<ChunkAlignment, String> {
    serde_json::from_str(json).map_err(|e| format!("JSON de alineación inválido: {e}"))
}

fn timings_to_json(timings: &[narration_sync::WordTiming]) -> Result<String, String> {
    serde_json::to_string(timings).map_err(|e| format!("No se pudo serializar timings: {e}"))
}

#[wasm_bindgen]
pub fn active_word_index_wasm(starts: &[u32], ends: &[u32], time_ms: u32) -> i32 {
    active_word_index(starts, ends, time_ms)
}

#[wasm_bindgen]
pub fn spoken_word_count_wasm(starts: &[u32], ends: &[u32], time_ms: u32) -> u32 {
    spoken_word_count(starts, ends, time_ms)
}

/// Devuelve `[active_index, spoken_count]` para un tick de audio.
#[wasm_bindgen]
pub fn word_sync_state_wasm(starts: &[u32], ends: &[u32], time_ms: u32) -> Vec<i32> {
    let state = compute_word_sync_state(starts, ends, time_ms);
    vec![state.active_index, state.spoken_count as i32]
}

#[wasm_bindgen]
pub fn spoken_char_count_wasm(
    starts: &[u32],
    ends: &[u32],
    word_char_lens: &[u32],
    time_ms: u32,
) -> u32 {
    spoken_char_count_arrays(starts, ends, word_char_lens, time_ms)
}

#[wasm_bindgen]
pub fn resolve_source_timings_json(alignment_json: &str, source_text: &str) -> String {
    match parse_alignment(alignment_json) {
        Ok(alignment) => {
            let timings = source_word_timings(&alignment, source_text);
            timings_to_json(&timings).unwrap_or_else(|e| format!("{{\"error\":\"{e}\"}}"))
        }
        Err(e) => format!("{{\"error\":\"{e}\"}}"),
    }
}

#[wasm_bindgen]
pub fn resolve_subtitle_timings_json(
    alignment_json: &str,
    subtitle_text: &str,
    source_text: &str,
) -> String {
    match parse_alignment(alignment_json) {
        Ok(alignment) => {
            let subtitle = subtitle_text.trim();
            let timings = subtitle_timings_for_text(
                &alignment,
                if subtitle.is_empty() {
                    None
                } else {
                    Some(subtitle)
                },
                source_text,
            );
            timings_to_json(&timings).unwrap_or_else(|e| format!("{{\"error\":\"{e}\"}}"))
        }
        Err(e) => format!("{{\"error\":\"{e}\"}}"),
    }
}
