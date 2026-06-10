//! Lógica compartida de alineación y sincronización (Tauri + WASM).

mod resolve;
mod sync;
mod timing;
mod types;
mod words;

pub use resolve::{source_word_timings, subtitle_timings_for_text};
pub use sync::{
    active_word_index, compute_word_sync_state, spoken_char_count, spoken_char_count_arrays,
    spoken_word_count, WordSyncState,
};
pub use timing::{
    merge_chunk_alignments, proportional_word_timings, resample_timings_uniform,
    scale_to_duration_ms,
};
pub use types::{ChunkAlignment, WordTiming};
pub use words::split_words;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proportional_timings_cover_duration() {
        let words = vec!["one".into(), "two".into(), "three".into()];
        let timings = proportional_word_timings(&words, 1000);
        assert_eq!(timings.len(), 3);
        assert_eq!(timings[0].start_ms, 0);
        assert_eq!(timings.last().unwrap().end_ms, 1000);
    }

    #[test]
    fn source_word_timings_from_alignment_source() {
        let alignment = ChunkAlignment {
            duration_ms: 1000,
            words: vec![WordTiming {
                word: "hello".into(),
                start_ms: 0,
                end_ms: 1000,
            }],
            source_words: Some(vec![WordTiming {
                word: "hola".into(),
                start_ms: 0,
                end_ms: 1000,
            }]),
            alignment_method: None,
        };
        let out = source_word_timings(&alignment, "hola mundo");
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].word, "hola");
    }

    #[test]
    fn subtitle_resample_when_lengths_differ() {
        let alignment = ChunkAlignment {
            duration_ms: 1000,
            words: vec![],
            source_words: Some(vec![
                WordTiming {
                    word: "a".into(),
                    start_ms: 0,
                    end_ms: 500,
                },
                WordTiming {
                    word: "b".into(),
                    start_ms: 500,
                    end_ms: 1000,
                },
            ]),
            alignment_method: None,
        };
        let out = subtitle_timings_for_text(&alignment, Some("uno dos tres"), "a b");
        assert_eq!(out.len(), 3);
        assert_eq!(out.last().unwrap().end_ms, 1000);
    }
}
