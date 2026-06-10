import type { ChunkAlignment, WordTiming } from "@/types";

type WasmModule = typeof import("../wasm/pkg/narration_sync_wasm");

let wasmModule: WasmModule | null = null;
let initPromise: Promise<void> | null = null;

export function isSyncWasmReady(): boolean {
  return wasmModule !== null;
}

export async function initSyncWasm(): Promise<void> {
  if (wasmModule) {
    return;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const mod = await import("../wasm/pkg/narration_sync_wasm.js");
    await mod.default();
    wasmModule = mod;
  })();

  return initPromise;
}

function timingArrays(timings: WordTiming[]): {
  starts: Uint32Array;
  ends: Uint32Array;
} {
  const starts = new Uint32Array(timings.length);
  const ends = new Uint32Array(timings.length);
  for (let i = 0; i < timings.length; i += 1) {
    starts[i] = timings[i].start_ms;
    ends[i] = timings[i].end_ms;
  }
  return { starts, ends };
}

function parseTimingsJson(json: string): WordTiming[] {
  const parsed = JSON.parse(json) as unknown;
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "error" in parsed &&
    typeof (parsed as { error: string }).error === "string"
  ) {
    console.warn("[syncWasm]", (parsed as { error: string }).error);
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed as WordTiming[];
}

export function wasmActiveWordIndex(timings: WordTiming[], timeMs: number): number {
  if (!wasmModule || timings.length === 0) {
    return -1;
  }
  const { starts, ends } = timingArrays(timings);
  return wasmModule.active_word_index_wasm(starts, ends, Math.max(0, timeMs));
}

export function wasmSpokenWordCount(timings: WordTiming[], timeMs: number): number {
  if (!wasmModule || timings.length === 0) {
    return 0;
  }
  const { starts, ends } = timingArrays(timings);
  return wasmModule.spoken_word_count_wasm(starts, ends, Math.max(0, timeMs));
}

export function wasmWordSyncState(
  timings: WordTiming[],
  timeMs: number,
): { activeIndex: number; spokenCount: number } {
  if (!wasmModule || timings.length === 0) {
    return { activeIndex: -1, spokenCount: 0 };
  }
  const { starts, ends } = timingArrays(timings);
  const state = wasmModule.word_sync_state_wasm(
    starts,
    ends,
    Math.max(0, timeMs),
  );
  return {
    activeIndex: state[0] ?? -1,
    spokenCount: state[1] ?? 0,
  };
}

export function wasmSpokenCharCount(timings: WordTiming[], timeMs: number): number {
  if (!wasmModule || timings.length === 0) {
    return 0;
  }
  const starts = new Uint32Array(timings.length);
  const ends = new Uint32Array(timings.length);
  const lens = new Uint32Array(timings.length);
  for (let i = 0; i < timings.length; i += 1) {
    starts[i] = timings[i].start_ms;
    ends[i] = timings[i].end_ms;
    lens[i] = timings[i].word.length;
  }
  return wasmModule.spoken_char_count_wasm(
    starts,
    ends,
    lens,
    Math.max(0, timeMs),
  );
}

export function wasmSourceWordTimings(
  alignment: ChunkAlignment,
  sourceText: string,
): WordTiming[] {
  if (!wasmModule) {
    return [];
  }
  return parseTimingsJson(
    wasmModule.resolve_source_timings_json(
      JSON.stringify(alignment),
      sourceText,
    ),
  );
}

export function wasmSubtitleTimingsForText(
  alignment: ChunkAlignment,
  subtitleText: string | null,
  sourceText: string,
): WordTiming[] {
  if (!wasmModule) {
    return [];
  }
  return parseTimingsJson(
    wasmModule.resolve_subtitle_timings_json(
      JSON.stringify(alignment),
      subtitleText ?? "",
      sourceText,
    ),
  );
}
