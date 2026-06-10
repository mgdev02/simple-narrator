use narration_sync::{
    merge_chunk_alignments as merge_alignments_core, proportional_word_timings,
    scale_to_duration_ms, split_words, ChunkAlignment, WordTiming,
};

use crate::text::phonemize::phonemize_text;

/// Pesos relativos por fonema IPA/espeak (coeficientes empíricos, escalados al WAV real).
fn phoneme_weight(phoneme: &str) -> f64 {
    match phoneme {
        " " => 0.08,
        "." | "!" | "?" => 2.9,
        "," | ";" | ":" => 1.7,
        "ˈ" | "ˌ" => 0.12,
        "ː" | "ˑ" => 0.35,
        "ʰ" | "ʲ" | "ʷ" => 0.1,
        _ => {
            let ch = phoneme.chars().next();
            if ch.is_none() {
                return 0.2;
            }
            let c = ch.unwrap();
            if is_vowel_char(c) {
                2.75
            } else if c.is_alphanumeric() {
                2.45
            } else {
                0.25
            }
        }
    }
}

fn is_vowel_char(c: char) -> bool {
    matches!(
        c,
        'a' | 'e' | 'i' | 'o' | 'u' | 'y' | 'A' | 'E' | 'I' | 'O' | 'U' | 'Y'
            | 'ə' | 'ɜ' | 'ɪ' | 'ʊ' | 'ɔ' | 'æ' | 'ɑ' | 'ɛ' | 'ʌ' | 'ɐ' | 'ø' | 'œ'
            | 'ɯ' | 'ɨ' | 'ʉ' | 'ɒ' | 'ɤ' | 'ɶ' | 'ɘ' | 'ɵ' | 'ɞ'
    )
}

fn group_phonemes_by_words(phonemes: &[String], word_count: usize) -> Vec<Vec<String>> {
    if word_count == 0 || phonemes.is_empty() {
        return Vec::new();
    }

    let mut groups: Vec<Vec<String>> = Vec::new();
    let mut current: Vec<String> = Vec::new();

    for p in phonemes {
        if p == " " {
            if !current.is_empty() {
                groups.push(current);
                current = Vec::new();
            }
        } else {
            current.push(p.clone());
        }
    }

    if !current.is_empty() {
        groups.push(current);
    }

    if groups.len() == word_count {
        return groups;
    }

    redistribute_phonemes(phonemes, word_count)
}

fn redistribute_phonemes(phonemes: &[String], word_count: usize) -> Vec<Vec<String>> {
    let content: Vec<String> = phonemes
        .iter()
        .filter(|p| p.as_str() != " ")
        .cloned()
        .collect();

    if word_count == 0 {
        return Vec::new();
    }

    if content.is_empty() {
        return vec![Vec::new(); word_count];
    }

    let per_word = content.len() / word_count;
    let extra = content.len() % word_count;
    let mut groups = Vec::with_capacity(word_count);
    let mut idx = 0;

    for i in 0..word_count {
        let take = per_word + if i < extra { 1 } else { 0 };
        let end = (idx + take).min(content.len());
        groups.push(content[idx..end].to_vec());
        idx = end;
    }

    groups
}

fn word_weights(phoneme_groups: &[Vec<String>]) -> Vec<f64> {
    phoneme_groups
        .iter()
        .map(|group| group.iter().map(|p| phoneme_weight(p)).sum())
        .collect()
}

fn build_word_timings(words: &[String], phoneme_groups: &[Vec<String>], duration_ms: u32) -> Vec<WordTiming> {
    let weights = word_weights(phoneme_groups);
    if weights.len() != words.len() {
        return proportional_word_timings(words, duration_ms);
    }

    let ranges = scale_to_duration_ms(&weights, duration_ms);
    words
        .iter()
        .zip(ranges.iter())
        .map(|(word, (start, end))| WordTiming {
            word: word.clone(),
            start_ms: start.round() as u32,
            end_ms: end.round() as u32,
        })
        .collect()
}

pub fn align_text_to_duration(
    phonemize_bin: &std::path::Path,
    espeak_data: &std::path::Path,
    espeak_voice: &str,
    text: &str,
    duration_ms: u32,
) -> Result<Vec<WordTiming>, String> {
    let words = split_words(text);
    if words.is_empty() || duration_ms == 0 {
        return Ok(Vec::new());
    }

    let phonemes = phonemize_text(phonemize_bin, espeak_data, espeak_voice, text)?;
    let groups = group_phonemes_by_words(&phonemes, words.len());
    Ok(build_word_timings(&words, &groups, duration_ms))
}

pub fn build_chunk_alignment(
    phonemize_bin: &std::path::Path,
    espeak_data: &std::path::Path,
    tts_espeak_voice: &str,
    tts_text: &str,
    source_text: Option<&str>,
    source_espeak_voice: Option<&str>,
    duration_ms: u32,
) -> Result<ChunkAlignment, String> {
    let words = align_text_to_duration(
        phonemize_bin,
        espeak_data,
        tts_espeak_voice,
        tts_text,
        duration_ms,
    )?;

    let source_words = if let Some(source) = source_text {
        let trimmed = source.trim();
        let tts_trimmed = tts_text.trim();
        if trimmed.is_empty() || trimmed == tts_trimmed {
            None
        } else {
            let voice = source_espeak_voice.unwrap_or(tts_espeak_voice);
            Some(
                align_text_to_duration(
                    phonemize_bin,
                    espeak_data,
                    voice,
                    trimmed,
                    duration_ms,
                )?,
            )
        }
    } else {
        None
    };

    Ok(ChunkAlignment {
        duration_ms,
        words,
        source_words,
        alignment_method: Some("heuristic".to_string()),
    })
}

pub fn alignment_sidecar_path(wav_path: &std::path::Path) -> std::path::PathBuf {
    wav_path.with_extension("align.json")
}

pub fn merge_chunk_alignments(parts: &[ChunkAlignment]) -> ChunkAlignment {
    merge_alignments_core(parts)
}

pub fn write_alignment_sidecar(
    wav_path: &std::path::Path,
    alignment: &ChunkAlignment,
) -> Result<std::path::PathBuf, String> {
    let path = alignment_sidecar_path(wav_path);
    let json = serde_json::to_string_pretty(alignment)
        .map_err(|e| format!("No se pudo serializar alineación: {e}"))?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("No se pudo crear directorio de alineación: {e}"))?;
    }
    std::fs::write(&path, json)
        .map_err(|e| format!("No se pudo escribir {}: {e}", path.display()))?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn group_phonemes_splits_on_spaces() {
        let phonemes = vec![
            "ˈ".into(),
            "o".into(),
            "l".into(),
            "a".into(),
            " ".into(),
            "m".into(),
            "ˈ".into(),
            "u".into(),
            "n".into(),
            "d".into(),
            "o".into(),
            ".".into(),
        ];
        let groups = group_phonemes_by_words(&phonemes, 2);
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].len(), 4);
        assert_eq!(groups[1].len(), 7);
    }

    #[test]
    fn proportional_timings_cover_duration() {
        let words = vec!["one".into(), "two".into(), "three".into()];
        let timings = proportional_word_timings(&words, 1000);
        assert_eq!(timings.len(), 3);
        assert_eq!(timings[0].start_ms, 0);
        assert_eq!(timings.last().unwrap().end_ms, 1000);
    }
}
