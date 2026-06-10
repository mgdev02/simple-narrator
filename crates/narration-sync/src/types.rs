use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WordTiming {
    pub word: String,
    pub start_ms: u32,
    pub end_ms: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChunkAlignment {
    pub duration_ms: u32,
    pub words: Vec<WordTiming>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_words: Option<Vec<WordTiming>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alignment_method: Option<String>,
}
