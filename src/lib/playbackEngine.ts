import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { join } from "@tauri-apps/api/path";
import { generateAudio, preparePageText, translateText } from "@/lib/tauri";
import type {
  AppLanguage,
  ChunkAudioBundle,
  PreparePageTextResult,
  TtsProgressPayload,
} from "@/types";

const PATH_SEGMENT_PATTERN = /[/\\]/g;

export type PagePrepStatus =
  | "idle"
  | "analyzing"
  | "synthesizing"
  | "ready"
  | "error";

export interface PagePrepSnapshot {
  status: PagePrepStatus;
  totalChunks: number;
  chunksPrepared: number;
}

type PagePrepListener = (snapshot: PagePrepSnapshot) => void;

export interface PagePrepParams {
  docPath: string;
  page: number;
  listenLanguage: AppLanguage;
  modelStem: string;
}

export interface PageSession {
  status: PagePrepStatus;
  prepId: number;
  aborted: boolean;
  result: PreparePageTextResult | null;
  error: string | null;
  firstChunkReady: Promise<void>;
}

class SerialTaskQueue {
  private tail: Promise<void> = Promise.resolve();
  private generation = 0;

  bump(): void {
    this.generation += 1;
    this.tail = Promise.resolve();
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    const generation = this.generation;
    const next = this.tail.then(() => {
      if (generation !== this.generation) {
        throw new Error("Preparación cancelada");
      }
      return task();
    });
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

interface InternalPageState {
  status: PagePrepStatus;
  prepId: number;
  aborted: boolean;
  result: PreparePageTextResult | null;
  audioRoot: string | null;
  chunkPromises: Map<number, Promise<ChunkAudioBundle>>;
  chunksPrepared: number;
  error: string | null;
  firstChunkReady: Promise<void>;
  resolveFirst: () => void;
  ttsChunkCache: Map<number, string>;
  backgroundPrepStarted: boolean;
}

function cacheKey(params: PagePrepParams): string {
  return `${params.docPath}|${params.page}|${params.listenLanguage}|${params.modelStem}`;
}

function audioFileName(
  docPath: string,
  page: number,
  listenLanguage: AppLanguage,
  modelStem: string,
  chunkIndex: number,
): string {
  const safePath = docPath.replace(PATH_SEGMENT_PATTERN, "_");
  const safeStem = modelStem.replace(PATH_SEGMENT_PATTERN, "_");
  return `${safePath}-p${page}-${listenLanguage}-${safeStem}-c${chunkIndex}.wav`;
}

/**
 * Motor de audio: una página en caché, síntesis serializada (un Piper a la vez),
 * primer fragmento en background y el resto bajo demanda con lookahead.
 */
export class PlaybackEngine {
  private nextPrepId = 0;
  private readonly slots = new Map<string, InternalPageState>();
  private readonly synthesisQueue = new SerialTaskQueue();
  private readonly progressListeners = new Map<string, Set<PagePrepListener>>();

  constructor(private readonly getAudioRoot: () => Promise<string>) {}

  subscribeProgress(
    params: PagePrepParams,
    listener: PagePrepListener,
  ): () => void {
    const key = cacheKey(params);
    let listeners = this.progressListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this.progressListeners.set(key, listeners);
    }
    listeners.add(listener);

    const state = this.slots.get(key);
    if (state) {
      listener(this.snapshot(state));
    }

    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) {
        this.progressListeners.delete(key);
      }
    };
  }

  getProgress(params: PagePrepParams): PagePrepSnapshot {
    const state = this.slots.get(cacheKey(params));
    if (!state) {
      return {
        status: "idle",
        totalChunks: 0,
        chunksPrepared: 0,
      };
    }
    return this.snapshot(state);
  }

  getSession(params: PagePrepParams): PageSession | null {
    const state = this.slots.get(cacheKey(params));
    if (!state) {
      return null;
    }
    return {
      status: state.status,
      prepId: state.prepId,
      aborted: state.aborted,
      result: state.result,
      error: state.error,
      firstChunkReady: state.firstChunkReady,
    };
  }

  cancelAll(): void {
    this.synthesisQueue.bump();
    for (const state of this.slots.values()) {
      state.aborted = true;
      state.resolveFirst();
    }
    this.slots.clear();
    this.progressListeners.clear();
  }

  /** Aborta y elimina una página del mapa (libera trabajo abandonado). */
  releasePage(params: PagePrepParams): void {
    const key = cacheKey(params);
    const state = this.slots.get(key);
    if (!state) {
      return;
    }
    state.aborted = true;
    state.resolveFirst();
    this.slots.delete(key);
    this.progressListeners.delete(key);
    this.synthesisQueue.bump();
  }

  /**
   * Mantiene solo las páginas indicadas; cancela síntesis y prep del resto.
   * Usar al cambiar de página para no acumular slots ni bloquear la cola Piper.
   */
  retainOnly(allowed: PagePrepParams[]): void {
    const allowedKeys = new Set(allowed.map(cacheKey));
    let removed = false;

    for (const [key, state] of this.slots.entries()) {
      if (!allowedKeys.has(key)) {
        state.aborted = true;
        state.resolveFirst();
        this.slots.delete(key);
        this.progressListeners.delete(key);
        removed = true;
      }
    }

    if (removed) {
      this.synthesisQueue.bump();
    }
  }

  ensurePage(params: PagePrepParams): PageSession {
    const key = cacheKey(params);
    const existing = this.slots.get(key);

    if (
      existing &&
      !existing.aborted &&
      existing.status !== "error"
    ) {
      return this.publicSession(existing);
    }

    if (existing) {
      existing.aborted = true;
      existing.resolveFirst();
      this.slots.delete(key);
      this.progressListeners.delete(key);
    }

    const prepId = ++this.nextPrepId;
    let resolveFirst: () => void = () => undefined;
    const firstChunkReady = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const state: InternalPageState = {
      status: "analyzing",
      prepId,
      aborted: false,
      result: null,
      audioRoot: null,
      chunkPromises: new Map(),
      chunksPrepared: 0,
      error: null,
      firstChunkReady,
      resolveFirst,
      ttsChunkCache: new Map(),
      backgroundPrepStarted: false,
    };

    this.notifyProgress(params, state);

    this.slots.set(key, state);
    void this.bootstrapPage(params, state);
    return this.publicSession(state);
  }

  prefetch(params: PagePrepParams): void {
    if (!this.slots.has(cacheKey(params))) {
      this.ensurePage(params);
    }
  }

  /** Sintetiza chunks 2+ en background (solo tras Play o prefetch explícito). */
  startBackgroundChunkPrep(params: PagePrepParams): void {
    const state = this.slots.get(cacheKey(params));
    if (!state || state.backgroundPrepStarted || state.aborted) {
      return;
    }
    state.backgroundPrepStarted = true;
    void this.prepareRemainingChunks(params, state);
  }

  async waitForFirstChunk(params: PagePrepParams): Promise<PageSession> {
    const session = this.ensurePage(params);
    await session.firstChunkReady;
    return this.getSession(params) ?? session;
  }

  async getChunkBundle(
    params: PagePrepParams,
    chunkIndex: number,
  ): Promise<ChunkAudioBundle> {
    const state = this.slots.get(cacheKey(params));
    if (!state) {
      await this.waitForFirstChunk(params);
      return this.synthesizeChunk(params, chunkIndex);
    }

    await state.firstChunkReady;

    if (state.status === "error") {
      throw new Error(state.error ?? "Preparación fallida");
    }

    return this.synthesizeChunk(params, chunkIndex);
  }

  private publicSession(state: InternalPageState): PageSession {
    return {
      status: state.status,
      prepId: state.prepId,
      aborted: state.aborted,
      result: state.result,
      error: state.error,
      firstChunkReady: state.firstChunkReady,
    };
  }

  private isLive(params: PagePrepParams, state: InternalPageState): boolean {
    return !state.aborted && this.slots.get(cacheKey(params)) === state;
  }

  private totalChunks(state: InternalPageState): number {
    const result = state.result;
    if (!result) {
      return 0;
    }
    if (result.chunks.length > 0) {
      return result.chunks.length;
    }
    return result.source_chunks.length;
  }

  private snapshot(state: InternalPageState): PagePrepSnapshot {
    return {
      status: state.status,
      totalChunks: this.totalChunks(state),
      chunksPrepared: state.chunksPrepared,
    };
  }

  private notifyProgress(
    params: PagePrepParams,
    state: InternalPageState,
  ): void {
    const snapshot = this.snapshot(state);
    const listeners = this.progressListeners.get(cacheKey(params));
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  private async bootstrapPage(
    params: PagePrepParams,
    state: InternalPageState,
  ): Promise<void> {
    try {
      if (state.aborted || !this.isLive(params, state)) {
        return;
      }

      const result = await preparePageText(
        params.docPath,
        params.page,
        params.listenLanguage,
      );

      if (!this.isLive(params, state)) {
        state.resolveFirst();
        return;
      }

      state.result = result;
      const chunkTotal = result.chunks.length || result.source_chunks.length;
      if (chunkTotal === 0) {
        state.status = "error";
        state.error = "No hay texto válido para sintetizar.";
        this.notifyProgress(params, state);
        state.resolveFirst();
        return;
      }

      state.status = "synthesizing";
      state.audioRoot = await this.getAudioRoot();
      this.notifyProgress(params, state);

      await this.synthesizeChunk(params, 0);

      if (this.isLive(params, state)) {
        state.status = "ready";
        this.notifyProgress(params, state);
      } else {
        state.resolveFirst();
      }
    } catch (err) {
      if (!this.isLive(params, state)) {
        state.resolveFirst();
        return;
      }
      state.status = "error";
      state.error =
        err instanceof Error ? err.message : "No se pudo preparar el audio";
      this.notifyProgress(params, state);
      state.resolveFirst();
    }
  }

  private async resolveTtsText(
    params: PagePrepParams,
    state: InternalPageState,
    chunkIndex: number,
  ): Promise<string> {
    const result = state.result;
    if (!result) {
      throw new Error("La página no está preparada para sintetizar audio");
    }

    const cached = state.ttsChunkCache.get(chunkIndex);
    if (cached) {
      return cached;
    }

    const source = result.source_chunks[chunkIndex];
    if (!source) {
      throw new Error(`Fragmento ${chunkIndex + 1} no disponible`);
    }

    if (!result.translated) {
      const direct = result.chunks[chunkIndex] ?? source;
      state.ttsChunkCache.set(chunkIndex, direct);
      return direct;
    }

    const fromLang = result.detected_language;
    if (fromLang !== "es" && fromLang !== "en") {
      throw new Error(`Idioma detectado no soportado: ${fromLang}`);
    }

    const translated = await translateText(
      source,
      fromLang,
      params.listenLanguage,
    );
    state.ttsChunkCache.set(chunkIndex, translated);
    return translated;
  }

  private async prepareRemainingChunks(
    params: PagePrepParams,
    state: InternalPageState,
  ): Promise<void> {
    const total = state.result?.chunks.length ?? 0;
    for (let i = 1; i < total; i += 1) {
      if (!this.isLive(params, state)) {
        return;
      }
      try {
        await this.synthesizeChunk(params, i);
      } catch {
        if (!this.isLive(params, state)) {
          return;
        }
      }
    }
    if (this.isLive(params, state)) {
      this.notifyProgress(params, state);
    }
  }

  private synthesizeChunk(
    params: PagePrepParams,
    chunkIndex: number,
  ): Promise<ChunkAudioBundle> {
    const key = cacheKey(params);
    const state = this.slots.get(key);
    if (!state) {
      return Promise.reject(new Error("Sesión de página no encontrada"));
    }

    const cached = state.chunkPromises.get(chunkIndex);
    if (cached) {
      return cached;
    }

    const promise = this.runChunkSynthesis(params, state, chunkIndex);
    state.chunkPromises.set(chunkIndex, promise);
    return promise;
  }

  private async runChunkSynthesis(
    params: PagePrepParams,
    state: InternalPageState,
    chunkIndex: number,
  ): Promise<ChunkAudioBundle> {
    if (chunkIndex > 0) {
      await this.synthesizeChunk(params, chunkIndex - 1);
    }

    const result = state.result;
    const audioRoot = state.audioRoot;
    if (!result || !audioRoot) {
      throw new Error("La página no está preparada para sintetizar audio");
    }

    const chunkTotal = result.chunks.length || result.source_chunks.length;
    if (chunkIndex < 0 || chunkIndex >= chunkTotal) {
      throw new Error(`Fragmento ${chunkIndex + 1} no disponible`);
    }

    if (!this.isLive(params, state)) {
      throw new Error("Preparación cancelada");
    }

    const ttsText = await this.resolveTtsText(params, state, chunkIndex);
    const sourceText = result.source_chunks[chunkIndex] ?? null;

    const outputPath = await join(
      audioRoot,
      audioFileName(
        params.docPath,
        params.page,
        params.listenLanguage,
        params.modelStem,
        chunkIndex,
      ),
    );

    const bundle = await this.synthesisQueue.run(async () => {
      if (!this.isLive(params, state)) {
        throw new Error("Preparación cancelada");
      }

      let unlisten: UnlistenFn | null = null;
      try {
        unlisten = await listen<TtsProgressPayload>("tts-progress", () => {
          // reservado para progreso fino en UI
        });
        const audio = await generateAudio(
          ttsText,
          outputPath,
          params.listenLanguage,
          params.modelStem,
          sourceText,
        );
        return {
          path: audio.path,
          alignment: audio.alignment,
        };
      } finally {
        unlisten?.();
      }
    });

    state.chunksPrepared = Math.max(state.chunksPrepared, chunkIndex + 1);
    this.notifyProgress(params, state);

    if (chunkIndex === 0) {
      state.resolveFirst();
    }

    return bundle;
  }
}
