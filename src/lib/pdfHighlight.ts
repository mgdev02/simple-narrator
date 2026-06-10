import { activeWordIndex } from "@/lib/alignment";
import { isSyncWasmReady, wasmWordSyncState } from "@/lib/syncWasm";
import { clamp01 } from "@/lib/textWords";
import type { WordTiming } from "@/types";

/** Alineado con `transform: translateY` del glow en CSS. */
const GLOW_VISUAL_OFFSET_Y = 10;
/** Espacio entre el glow y el icono (px en pantalla). */
const INDICATOR_GAP_ABOVE_GLOW = 8;

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

interface SpanSlice {
  el: HTMLElement;
  start: number;
  end: number;
}

interface LayerIndex {
  normalized: string;
  slices: SpanSlice[];
}

export interface ChunkTextRange {
  matchStart: number;
  matchEnd: number;
}

interface WordBounds {
  start: number;
  end: number;
}

function buildSpanIndex(layer: HTMLElement): LayerIndex {
  const spans = layer.querySelectorAll<HTMLElement>("span");
  let text = "";
  const slices: SpanSlice[] = [];

  for (const el of spans) {
    const raw = el.textContent ?? "";
    if (!raw) continue;
    const start = text.length;
    text += raw;
    slices.push({ el, start, end: text.length });
    text += " ";
  }

  return {
    normalized: normalizeForMatch(text),
    slices,
  };
}

function locateChunkRange(index: LayerIndex, chunk: string): ChunkTextRange | null {
  const needle = normalizeForMatch(chunk);
  if (!needle || needle.length < 2 || !index.normalized) {
    return null;
  }

  const probe = needle.slice(0, Math.min(needle.length, 96));
  let matchStart = index.normalized.indexOf(probe);

  if (matchStart === -1 && needle.length > 24) {
    matchStart = index.normalized.indexOf(needle.slice(0, 24));
  }

  if (matchStart === -1) {
    const firstWord = needle.split(/\s+/).find((w) => w.length > 3);
    if (firstWord) {
      matchStart = index.normalized.indexOf(firstWord);
    }
  }

  if (matchStart === -1) {
    return null;
  }

  const matchEnd = matchStart + needle.length;
  return { matchStart, matchEnd };
}

function findWordInSlice(
  slice: string,
  word: string,
  from: number,
): { idx: number; len: number } | null {
  const normWord = normalizeForMatch(word);
  if (!normWord) {
    return null;
  }

  let idx = slice.indexOf(normWord, from);
  if (idx !== -1) {
    return { idx, len: normWord.length };
  }

  const alnum = normWord.replace(/[^\p{L}\p{N}]/gu, "");
  if (alnum.length >= 2) {
    idx = slice.indexOf(alnum, from);
    if (idx !== -1) {
      return { idx, len: alnum.length };
    }
  }

  return null;
}

/**
 * Ubica cada palabra en la capa PDF (no en el chunk de extracción) para evitar
 * drift entre pdf_extract y pdf.js.
 */
function buildWordBoundsInLayer(
  index: LayerIndex,
  range: ChunkTextRange,
  wordTimings: WordTiming[],
): WordBounds[] {
  if (wordTimings.length === 0) {
    return [];
  }

  const slice = index.normalized.slice(range.matchStart, range.matchEnd);
  const bounds: WordBounds[] = [];
  let pos = 0;
  const remaining = wordTimings.length;

  for (let i = 0; i < wordTimings.length; i += 1) {
    const found = findWordInSlice(slice, wordTimings[i].word, pos);

    if (found) {
      bounds.push({
        start: range.matchStart + found.idx,
        end: range.matchStart + found.idx + found.len,
      });
      pos = found.idx + found.len;
      while (pos < slice.length && slice[pos] === " ") {
        pos += 1;
      }
      continue;
    }

    const slotsLeft = remaining - i;
    const sliceLeft = slice.length - pos;
    const slot = Math.max(1, Math.ceil(sliceLeft / slotsLeft));
    bounds.push({
      start: range.matchStart + pos,
      end: range.matchStart + Math.min(slice.length, pos + slot),
    });
    pos = Math.min(slice.length, pos + slot);
  }

  return bounds;
}

/** Micrófono (marca la palabra que se está narrando). */
const WORD_INDICATOR_ICON_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`;

export function clearPdfHighlights(layer: HTMLElement): void {
  layer
    .querySelectorAll<HTMLElement>("span")
    .forEach((span) => {
      span.classList.remove("pdf-text-highlight", "pdf-text-highlight-active");
    });
}

/** Sesión de resaltado: solo la palabra que se está pronunciando en este instante. */
export class LayerHighlightSession {
  private index: LayerIndex | null = null;
  private range: ChunkTextRange | null = null;
  private trackedSpans = new Set<HTMLElement>();
  private wordTimings: WordTiming[] = [];
  private wordBounds: WordBounds[] = [];
  private durationMs = 0;
  private indicatorEl: HTMLElement | null = null;

  constructor(private readonly layer: HTMLElement) {}

  private resolveActiveWordIndex(timeMs: number): number {
    if (this.wordTimings.length === 0) {
      return -1;
    }
    if (isSyncWasmReady()) {
      return wasmWordSyncState(this.wordTimings, timeMs).activeIndex;
    }
    return activeWordIndex(this.wordTimings, timeMs);
  }

  private isWordActiveAtTime(index: number, timeMs: number): boolean {
    if (index < 0 || index >= this.wordTimings.length) {
      return false;
    }
    const timing = this.wordTimings[index];
    return timeMs >= timing.start_ms && timeMs < timing.end_ms;
  }

  /** Superficie de scroll: el icono no escala con `--pdf-visual-scale` del PDF. */
  private indicatorHost(): HTMLElement | null {
    return this.layer.closest<HTMLElement>(".pdf-viewer-surface");
  }

  private ensureWordIndicator(host: HTMLElement): HTMLElement {
    if (this.indicatorEl && host.contains(this.indicatorEl)) {
      return this.indicatorEl;
    }

    const existing = host.querySelector<HTMLElement>(".pdf-word-indicator");
    if (existing) {
      this.indicatorEl = existing;
      return existing;
    }

    const indicator = document.createElement("div");
    indicator.className = "pdf-word-indicator";
    indicator.innerHTML = WORD_INDICATOR_ICON_SVG;
    host.appendChild(indicator);
    this.indicatorEl = indicator;
    return indicator;
  }

  private hideWordIndicator(): void {
    if (this.indicatorEl) {
      this.indicatorEl.classList.remove("pdf-word-indicator-visible");
    }
  }

  private removeWordIndicator(): void {
    if (this.indicatorEl) {
      this.indicatorEl.remove();
      this.indicatorEl = null;
    }
  }

  private updateWordIndicator(active: Set<HTMLElement>): void {
    const host = this.indicatorHost();
    if (!host || active.size === 0) {
      this.hideWordIndicator();
      return;
    }

    const indicator = this.ensureWordIndicator(host);
    const hostRect = host.getBoundingClientRect();
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;

    for (const el of active) {
      const rect = el.getBoundingClientRect();
      minX = Math.min(minX, rect.left);
      minY = Math.min(minY, rect.top);
      maxX = Math.max(maxX, rect.right);
    }

    const centerX = (minX + maxX) / 2 - hostRect.left + host.scrollLeft;
    const glowTop =
      minY - hostRect.top + host.scrollTop - GLOW_VISUAL_OFFSET_Y;
    const indicatorTop = glowTop - INDICATOR_GAP_ABOVE_GLOW;

    indicator.style.left = `${centerX}px`;
    indicator.style.top = `${indicatorTop}px`;
    indicator.classList.add("pdf-word-indicator-visible");
  }

  beginChunk(chunk: string, wordTimings: WordTiming[] = [], durationMs = 0): void {
    clearPdfHighlights(this.layer);
    this.resetHighlightState();
    this.hideWordIndicator();
    this.index = buildSpanIndex(this.layer);
    this.range = locateChunkRange(this.index, chunk);
    this.wordTimings = wordTimings;
    this.durationMs = durationMs;

    if (this.index && this.range && wordTimings.length > 0) {
      this.wordBounds = buildWordBoundsInLayer(
        this.index,
        this.range,
        wordTimings,
      );
    } else {
      this.wordBounds = [];
    }

    this.setProgress(0);
  }

  setProgress(progress: number): void {
    if (!this.index || !this.range) {
      return;
    }

    const span = this.range.matchEnd - this.range.matchStart;
    if (span <= 0) {
      return;
    }

    const highlightEnd =
      this.range.matchStart + Math.floor(clamp01(progress) * span);

    let activeIdx = -1;
    if (this.wordBounds.length > 0) {
      activeIdx = Math.min(
        this.wordBounds.length - 1,
        Math.floor(clamp01(progress) * this.wordBounds.length),
      );
    }

    this.applyProgressRange(highlightEnd, activeIdx);
  }

  setTimeMs(timeMs: number): void {
    if (!this.index || !this.range) {
      return;
    }

    if (this.wordBounds.length > 0 && this.wordTimings.length > 0) {
      this.applyWordState(timeMs);
      return;
    }

    if (this.durationMs > 0) {
      const span = this.range.matchEnd - this.range.matchStart;
      const ratio = clamp01(timeMs / this.durationMs);
      const highlightEnd = this.range.matchStart + Math.floor(ratio * span);
      this.applyProgressRange(highlightEnd, -1);
    }
  }

  clear(): void {
    this.resetHighlightState();
    this.hideWordIndicator();
    this.removeWordIndicator();
    clearPdfHighlights(this.layer);
    this.index = null;
    this.range = null;
    this.wordTimings = [];
    this.wordBounds = [];
    this.durationMs = 0;
  }

  private spansForBounds(start: number, end: number): HTMLElement[] {
    if (!this.index) {
      return [];
    }

    const spans: HTMLElement[] = [];
    for (const slice of this.index.slices) {
      if (slice.end > start && slice.start < end) {
        spans.push(slice.el);
      }
    }
    return spans;
  }

  private applyWordState(timeMs: number): void {
    const active = this.resolveActiveWordIndex(timeMs);
    const targetActive = new Set<HTMLElement>();

    if (this.isWordActiveAtTime(active, timeMs) && active < this.wordBounds.length) {
      const bounds = this.wordBounds[active];
      for (const el of this.spansForBounds(bounds.start, bounds.end)) {
        targetActive.add(el);
      }
    }

    this.applyActiveSpans(targetActive);
  }

  /** Progreso lineal (fallback): solo la palabra activa estimada. */
  private applyProgressRange(_highlightEnd: number, activeWordIndex: number): void {
    const targetActive = new Set<HTMLElement>();

    if (
      activeWordIndex >= 0 &&
      activeWordIndex < this.wordBounds.length
    ) {
      const bounds = this.wordBounds[activeWordIndex];
      for (const el of this.spansForBounds(bounds.start, bounds.end)) {
        targetActive.add(el);
      }
    }

    this.applyActiveSpans(targetActive);
  }

  /** Cambio instantáneo de palabra (misma lógica/tick que subtítulos). */
  private applyActiveSpans(active: Set<HTMLElement>): void {
    for (const el of this.trackedSpans) {
      if (!active.has(el)) {
        el.classList.remove("pdf-text-highlight", "pdf-text-highlight-active");
        this.trackedSpans.delete(el);
      }
    }

    for (const el of active) {
      el.classList.remove("pdf-text-highlight");
      el.classList.add("pdf-text-highlight-active");
      this.trackedSpans.add(el);
    }

    this.updateWordIndicator(active);
  }

  private resetHighlightState(): void {
    this.trackedSpans.clear();
  }
}

export function highlightChunkInLayer(layer: HTMLElement, chunk: string): void {
  const session = new LayerHighlightSession(layer);
  session.beginChunk(chunk);
  session.setProgress(1);
}
