use crate::timing::{proportional_word_timings, remap_word_labels, resample_timings_uniform};
use crate::types::{ChunkAlignment, WordTiming};
use crate::words::split_words;

pub fn source_word_timings(alignment: &ChunkAlignment, source_text: &str) -> Vec<WordTiming> {
    let trimmed = source_text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    if let Some(source_words) = &alignment.source_words {
        if !source_words.is_empty() {
            return source_words.clone();
        }
    }

    let words = split_words(trimmed);
    if words.len() == alignment.words.len() {
        return remap_word_labels(&alignment.words, &words);
    }

    proportional_word_timings(&words, alignment.duration_ms)
}

pub fn subtitle_timings_for_text(
    alignment: &ChunkAlignment,
    subtitle_text: Option<&str>,
    source_text: &str,
) -> Vec<WordTiming> {
    let subtitle_trimmed = subtitle_text.map(|t| t.trim()).filter(|t| !t.is_empty());
    if subtitle_trimmed.is_none() {
        return Vec::new();
    }

    let subtitle_words = split_words(subtitle_trimmed.unwrap());
    if subtitle_words.is_empty() {
        return Vec::new();
    }

    let source_trimmed = source_text.trim();
    let source_words = alignment
        .source_words
        .as_ref()
        .filter(|w| !w.is_empty())
        .or_else(|| {
            if source_trimmed == subtitle_trimmed.unwrap() {
                Some(&alignment.words)
            } else {
                None
            }
        });

    if let Some(timings) = source_words {
        if timings.len() == subtitle_words.len() {
            return remap_word_labels(timings, &subtitle_words);
        }

        if !timings.is_empty() {
            return resample_timings_uniform(&subtitle_words, alignment.duration_ms);
        }
    }

    if alignment.words.len() == subtitle_words.len() {
        return remap_word_labels(&alignment.words, &subtitle_words);
    }

    proportional_word_timings(&subtitle_words, alignment.duration_ms)
}
