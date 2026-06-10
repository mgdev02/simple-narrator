export interface PdfMetadataResult {
  path: string;
  page_count: number;
  file_size_bytes: number;
}

export interface PdfPageTextResult {
  path: string;
  display_page: number;
  pdf_page_number: number;
  text: string;
  character_count: number;
  word_count: number;
}

export interface WordTiming {
  word: string;
  start_ms: number;
  end_ms: number;
}

export interface ChunkAlignment {
  duration_ms: number;
  words: WordTiming[];
  source_words?: WordTiming[];
  /** `onnx_w_ceil` = timings del modelo; `heuristic` = estimación fonémica */
  alignment_method?: string;
}

export interface ChunkAudioBundle {
  path: string;
  alignment: ChunkAlignment;
}

export interface GenerateAudioResult {
  path: string;
  chunk_count: number;
  duration_ms: number;
  alignment_path: string;
  alignment: ChunkAlignment;
}

export interface TtsProgressPayload {
  current_chunk: number;
  total_chunks: number;
  progress: number;
}

export type PlayerStatus =
  | "idle"
  | "opening"
  | "ready"
  | "preparing"
  | "playing"
  | "paused"
  | "error";

export type AppLanguage = "es" | "en";

export interface PreparePageTextResult {
  path: string;
  display_page: number;
  detected_language: string;
  translated: boolean;
  chunks: string[];
  highlight_chunks: string[];
  source_chunks: string[];
}

export interface OpenDocument {
  path: string;
  name: string;
  pageCount: number;
  fileSizeBytes: number;
  detectedLanguage: AppLanguage | null;
}
