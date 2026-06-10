import {
  activeWordIndex,
  sourceWordTimings,
  subtitleTimingsForText,
} from "@/lib/alignment";
import { isSyncWasmReady, wasmWordSyncState } from "@/lib/syncWasm";
import { LayerHighlightSession } from "@/lib/pdfHighlight";
import { splitWords } from "@/lib/textWords";
import type { ChunkAlignment, WordTiming } from "@/types";

export interface AudioTickState {
  currentTime: number;
  duration: number;
}

export type AudioTickHandler = (state: AudioTickState) => void;

/**
 * Sincroniza resaltado PDF y subtítulos con timings fonémicos (palabra a palabra).
 */
export class NarrationSyncController {
  private highlightSession: LayerHighlightSession | null = null;
  private subtitleRoot: HTMLElement | null = null;
  private sourceChunk = "";
  private subtitleWords: string[] = [];
  private subtitleSpans: HTMLElement[] = [];
  private alignment: ChunkAlignment | null = null;
  private sourceWordTimingsList: WordTiming[] = [];
  private subtitleWordTimingsList: WordTiming[] = [];
  private lastTimeMs = 0;

  attachTextLayer(layer: HTMLElement | null): void {
    this.highlightSession = layer ? new LayerHighlightSession(layer) : null;
    if (this.sourceChunk && this.highlightSession) {
      this.highlightSession.beginChunk(
        this.sourceChunk,
        this.sourceWordTimingsList,
        this.alignment?.duration_ms ?? 0,
      );
      this.highlightSession.setTimeMs(this.lastTimeMs);
    }
  }

  attachSubtitleRoot(root: HTMLElement | null): void {
    this.subtitleRoot = root;
    if (!root) {
      this.subtitleSpans = [];
      return;
    }
    if (this.subtitleWords.length > 0) {
      this.renderSubtitleWords();
      this.applySubtitleTimeMs(this.lastTimeMs);
    }
  }

  beginChunk(
    sourceText: string,
    subtitleText: string | null,
    alignment: ChunkAlignment | null,
  ): void {
    this.sourceChunk = sourceText.trim();
    this.subtitleWords = subtitleText ? splitWords(subtitleText) : [];
    this.alignment = alignment;
    this.lastTimeMs = 0;

    this.sourceWordTimingsList = alignment
      ? sourceWordTimings(alignment, this.sourceChunk)
      : [];
    this.subtitleWordTimingsList = alignment
      ? subtitleTimingsForText(alignment, subtitleText, this.sourceChunk)
      : [];

    if (this.highlightSession && this.sourceChunk) {
      this.highlightSession.beginChunk(
        this.sourceChunk,
        this.sourceWordTimingsList,
        alignment?.duration_ms ?? 0,
      );
    }

    this.renderSubtitleWords();
    this.applySubtitleTimeMs(0);
  }

  onAudioTick(state: AudioTickState): void {
    const timeMs = Math.max(0, state.currentTime * 1000);
    this.lastTimeMs = timeMs;

    if (this.highlightSession) {
      if (this.sourceWordTimingsList.length > 0 || this.alignment) {
        this.highlightSession.setTimeMs(timeMs);
      } else {
        const duration =
          Number.isFinite(state.duration) && state.duration > 0
            ? state.duration
            : 0;
        const progress = duration > 0 ? state.currentTime / duration : 0;
        this.highlightSession.setProgress(progress);
      }
    }

    this.applySubtitleTimeMs(timeMs);
  }

  updateSubtitle(subtitleText: string | null): void {
    this.subtitleWords = subtitleText ? splitWords(subtitleText) : [];
    this.subtitleWordTimingsList = this.alignment
      ? subtitleTimingsForText(
          this.alignment,
          subtitleText,
          this.sourceChunk,
        )
      : [];
    this.renderSubtitleWords();
    this.applySubtitleTimeMs(this.lastTimeMs);
  }

  endChunk(): void {
    this.sourceChunk = "";
    this.subtitleWords = [];
    this.subtitleSpans = [];
    this.alignment = null;
    this.sourceWordTimingsList = [];
    this.subtitleWordTimingsList = [];
    this.lastTimeMs = 0;

    if (this.highlightSession) {
      this.highlightSession.clear();
    }

    if (this.subtitleRoot) {
      this.subtitleRoot.innerHTML = "";
    }
  }

  clear(): void {
    this.endChunk();
    this.highlightSession = null;
    this.subtitleRoot = null;
  }

  private renderSubtitleWords(): void {
    const root = this.subtitleRoot;
    if (!root) {
      this.subtitleSpans = [];
      return;
    }

    root.innerHTML = "";

    if (this.subtitleWords.length === 0) {
      return;
    }

    const fragment = document.createDocumentFragment();
    const spans: HTMLElement[] = [];

    for (let i = 0; i < this.subtitleWords.length; i += 1) {
      const span = document.createElement("span");
      span.className = "subtitle-word";
      span.textContent = this.subtitleWords[i];
      spans.push(span);
      fragment.appendChild(span);
      if (i < this.subtitleWords.length - 1) {
        fragment.appendChild(document.createTextNode(" "));
      }
    }

    root.appendChild(fragment);
    this.subtitleSpans = spans;
  }

  private applySubtitleTimeMs(timeMs: number): void {
    if (this.subtitleSpans.length === 0) {
      return;
    }

    if (this.subtitleWordTimingsList.length === this.subtitleSpans.length) {
      const { activeIndex: active, spokenCount } = isSyncWasmReady()
        ? wasmWordSyncState(this.subtitleWordTimingsList, timeMs)
        : (() => {
            const idx = activeWordIndex(this.subtitleWordTimingsList, timeMs);
            const count =
              idx < 0
                ? 0
                : timeMs >= this.subtitleWordTimingsList[idx].end_ms
                  ? idx + 1
                  : idx;
            return { activeIndex: idx, spokenCount: count };
          })();

      for (let i = 0; i < this.subtitleSpans.length; i += 1) {
        const span = this.subtitleSpans[i];
        const timing = this.subtitleWordTimingsList[i];
        const isFullySpoken = i < spokenCount;
        const isActive =
          i === active &&
          timeMs >= timing.start_ms &&
          timeMs < timing.end_ms;

        span.classList.toggle("subtitle-word-spoken", isFullySpoken);
        span.classList.toggle("subtitle-word-active", isActive);
      }
      return;
    }

    const duration = this.alignment?.duration_ms ?? 0;
    const progress =
      duration > 0 ? Math.min(1, timeMs / duration) : 0;
    const spokenCount = Math.min(
      this.subtitleSpans.length,
      Math.floor(progress * this.subtitleSpans.length),
    );

    for (let i = 0; i < this.subtitleSpans.length; i += 1) {
      const span = this.subtitleSpans[i];
      span.classList.toggle("subtitle-word-spoken", i < spokenCount);
      span.classList.remove("subtitle-word-active");
    }
  }
}
