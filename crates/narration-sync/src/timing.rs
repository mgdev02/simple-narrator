use crate::types::{ChunkAlignment, WordTiming};

pub fn scale_to_duration_ms(weights: &[f64], duration_ms: u32) -> Vec<(f64, f64)> {
    if weights.is_empty() {
        return Vec::new();
    }

    let total = weights.iter().sum::<f64>();
    if total <= 0.0 || duration_ms == 0 {
        return Vec::new();
    }

    let mut timings = Vec::with_capacity(weights.len());
    let mut cursor = 0.0;
    let duration = duration_ms as f64;

    for &weight in weights {
        let start = cursor;
        cursor += (weight / total) * duration;
        timings.push((start, cursor));
    }

    timings
}

pub fn proportional_word_timings(words: &[String], duration_ms: u32) -> Vec<WordTiming> {
    if words.is_empty() {
        return Vec::new();
    }

    let char_weights: Vec<f64> = words
        .iter()
        .map(|w| w.chars().count().max(1) as f64)
        .collect();

    let ranges = scale_to_duration_ms(&char_weights, duration_ms);
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

/// Reparte `duration_ms` en slots uniformes para cada palabra destino.
pub fn resample_timings_uniform(target_words: &[String], duration_ms: u32) -> Vec<WordTiming> {
    let count = target_words.len();
    if count == 0 {
        return Vec::new();
    }

    target_words
        .iter()
        .enumerate()
        .map(|(index, word)| {
            let start_ratio = index as f64 / count as f64;
            let end_ratio = (index + 1) as f64 / count as f64;
            let start_ms = (start_ratio * duration_ms as f64).round() as u32;
            let end_ms = if index == count - 1 {
                duration_ms
            } else {
                (end_ratio * duration_ms as f64).round() as u32
            };
            WordTiming {
                word: word.clone(),
                start_ms,
                end_ms,
            }
        })
        .collect()
}

pub fn remap_word_labels(timings: &[WordTiming], labels: &[String]) -> Vec<WordTiming> {
    timings
        .iter()
        .zip(labels.iter())
        .map(|(timing, label)| WordTiming {
            word: label.clone(),
            start_ms: timing.start_ms,
            end_ms: timing.end_ms,
        })
        .collect()
}

pub fn merge_chunk_alignments(parts: &[ChunkAlignment]) -> ChunkAlignment {
    use crate::types::ChunkAlignment;

    if parts.is_empty() {
        return ChunkAlignment {
            duration_ms: 0,
            words: Vec::new(),
            source_words: None,
            alignment_method: None,
        };
    }

    if parts.len() == 1 {
        return parts[0].clone();
    }

    let mut offset_ms = 0u32;
    let mut words = Vec::new();
    let mut source_words: Vec<WordTiming> = Vec::new();
    let method = parts[0].alignment_method.clone();

    for part in parts {
        for word in &part.words {
            words.push(WordTiming {
                word: word.word.clone(),
                start_ms: word.start_ms + offset_ms,
                end_ms: word.end_ms + offset_ms,
            });
        }

        if let Some(source) = &part.source_words {
            for word in source {
                source_words.push(WordTiming {
                    word: word.word.clone(),
                    start_ms: word.start_ms + offset_ms,
                    end_ms: word.end_ms + offset_ms,
                });
            }
        }

        offset_ms += part.duration_ms;
    }

    ChunkAlignment {
        duration_ms: offset_ms,
        words,
        source_words: if source_words.is_empty() {
            None
        } else {
            Some(source_words)
        },
        alignment_method: method,
    }
}
