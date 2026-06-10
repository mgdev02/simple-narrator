pub mod alignment;
pub mod chunk;
pub mod phonemize;
pub mod words;

pub use alignment::{
    alignment_sidecar_path, build_chunk_alignment, merge_chunk_alignments,
    write_alignment_sidecar,
};
pub use narration_sync::{ChunkAlignment, WordTiming};
pub use chunk::{chunk_text, chunk_text_for_playback, DEFAULT_MAX_CHUNK_CHARS};
pub use phonemize::resolve_espeak_data;
