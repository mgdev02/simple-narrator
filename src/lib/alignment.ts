import {
  isSyncWasmReady,
  wasmActiveWordIndex,
  wasmSourceWordTimings,
  wasmSpokenCharCount,
  wasmSubtitleTimingsForText,
} from "@/lib/syncWasm";
import type { ChunkAlignment, WordTiming } from "@/types";

function activeWordIndexTs(timings: WordTiming[], timeMs: number): number {
  if (timings.length === 0) {
    return -1;
  }

  for (let i = 0; i < timings.length; i += 1) {
    if (timeMs < timings[i].end_ms) {
      return i;
    }
  }

  return timings.length - 1;
}

/** Índice de palabra activa; WASM en el hot path de sincronización (~60 Hz). */
export function activeWordIndex(timings: WordTiming[], timeMs: number): number {
  if (isSyncWasmReady()) {
    return wasmActiveWordIndex(timings, timeMs);
  }
  return activeWordIndexTs(timings, timeMs);
}

export function spokenCharCount(timings: WordTiming[], timeMs: number): number {
  if (isSyncWasmReady()) {
    return wasmSpokenCharCount(timings, timeMs);
  }
  return spokenCharCountTs(timings, timeMs);
}

function spokenCharCountTs(timings: WordTiming[], timeMs: number): number {
  if (timings.length === 0) {
    return 0;
  }

  let chars = 0;
  for (let i = 0; i < timings.length; i += 1) {
    const timing = timings[i];
    const wordLen = timing.word.length;
    if (timeMs >= timing.end_ms) {
      chars += wordLen;
      continue;
    }
    if (timeMs <= timing.start_ms) {
      break;
    }
    const span = Math.max(1, timing.end_ms - timing.start_ms);
    const partial = (timeMs - timing.start_ms) / span;
    chars += Math.floor(partial * wordLen);
    break;
  }

  return chars;
}

export function subtitleTimingsForText(
  alignment: ChunkAlignment,
  subtitleText: string | null,
  sourceText: string,
): WordTiming[] {
  if (isSyncWasmReady()) {
    const wasm = wasmSubtitleTimingsForText(alignment, subtitleText, sourceText);
    if (wasm.length > 0 || !subtitleText?.trim()) {
      return wasm;
    }
  }
  return subtitleTimingsForTextTs(alignment, subtitleText, sourceText);
}

function subtitleTimingsForTextTs(
  alignment: ChunkAlignment,
  subtitleText: string | null,
  sourceText: string,
): WordTiming[] {
  if (!subtitleText?.trim()) {
    return [];
  }

  const subtitleWords = subtitleText.trim().split(/\s+/).filter(Boolean);
  if (subtitleWords.length === 0) {
    return [];
  }

  const sourceTrimmed = sourceText.trim();
  const sourceWords =
    alignment.source_words ??
    (sourceTrimmed === subtitleText.trim() ? alignment.words : undefined);

  if (sourceWords && sourceWords.length === subtitleWords.length) {
    return sourceWords.map((timing, i) => ({
      ...timing,
      word: subtitleWords[i] ?? timing.word,
    }));
  }

  if (sourceWords && sourceWords.length > 0) {
    return resampleTimings(sourceWords, subtitleWords, alignment.duration_ms);
  }

  if (alignment.words.length === subtitleWords.length) {
    return alignment.words.map((timing, i) => ({
      ...timing,
      word: subtitleWords[i] ?? timing.word,
    }));
  }

  return proportionalTimings(subtitleWords, alignment.duration_ms);
}

function resampleTimings(
  _source: WordTiming[],
  targetWords: string[],
  durationMs: number,
): WordTiming[] {
  const count = targetWords.length;
  if (count === 0) {
    return [];
  }

  return targetWords.map((word, index) => {
    const startRatio = index / count;
    const endRatio = (index + 1) / count;
    const startMs = Math.round(startRatio * durationMs);
    const endMs =
      index === count - 1
        ? durationMs
        : Math.round(endRatio * durationMs);
    return { word, start_ms: startMs, end_ms: endMs };
  });
}

function proportionalTimings(words: string[], durationMs: number): WordTiming[] {
  const weights = words.map((w) => w.length);
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total === 0) {
    return [];
  }

  let cursor = 0;
  return words.map((word, index) => {
    const startMs = cursor;
    const slice = Math.round((weights[index] / total) * durationMs);
    cursor += slice;
    const endMs = index === words.length - 1 ? durationMs : cursor;
    return { word, start_ms: startMs, end_ms: endMs };
  });
}

export function sourceWordTimings(
  alignment: ChunkAlignment,
  sourceText: string,
): WordTiming[] {
  if (isSyncWasmReady()) {
    const wasm = wasmSourceWordTimings(alignment, sourceText);
    if (wasm.length > 0 || !sourceText.trim()) {
      return wasm;
    }
  }
  return sourceWordTimingsTs(alignment, sourceText);
}

function sourceWordTimingsTs(
  alignment: ChunkAlignment,
  sourceText: string,
): WordTiming[] {
  const trimmed = sourceText.trim();
  if (!trimmed) {
    return [];
  }

  if (alignment.source_words && alignment.source_words.length > 0) {
    return alignment.source_words;
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === alignment.words.length) {
    return alignment.words.map((timing, i) => ({
      ...timing,
      word: words[i] ?? timing.word,
    }));
  }

  return proportionalTimings(words, alignment.duration_ms);
}
