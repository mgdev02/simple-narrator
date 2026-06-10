import { useCallback, useEffect, useRef, useState } from "react";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { APP_CACHE_FOLDER, PLAYER_READY_MESSAGE } from "@/lib/app";
import { oppositeLanguage } from "@/lib/languages";
import {
  PlaybackEngine,
  type PagePrepParams,
  type PagePrepStatus,
} from "@/lib/playbackEngine";
import {
  resetPagePrepSnapshot,
  setPagePrepSnapshot,
} from "@/lib/pagePrepStore";
import { devDiag } from "@/lib/devDiag";
import {
  isScrollSpyBlockedForLayout,
  isScrollSpySuppressed,
} from "@/lib/scrollSpySuppress";
import { waitForUiPaint } from "@/lib/ui";
import {
  closePdf,
  openPdf,
  pickPdfFile,
  preloadPdf,
  translateText,
} from "@/lib/tauri";
import { NarrationSyncController } from "@/lib/narrationSync";
import { WavAudioPlayer } from "@/lib/wavAudioPlayer";
import { voiceForLanguage } from "@/lib/voicePreferenceStore";
import type {
  AppLanguage,
  ChunkAudioBundle,
  OpenDocument,
  PlayerStatus,
  PreparePageTextResult,
} from "@/types";

const PDF_VIEWER_LOAD_TIMEOUT_MS = 90_000;

function fileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] ?? path;
}

let audioRootPromise: Promise<string> | null = null;

function getPlaybackAudioRoot(): Promise<string> {
  if (!audioRootPromise) {
    audioRootPromise = appCacheDir().then((dir) =>
      join(dir, APP_CACHE_FOLDER, "playback"),
    );
  }
  return audioRootPromise;
}

export function usePodcastPlayer() {
  const [document, setDocument] = useState<OpenDocument | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  /** Página visible en scroll (contador); no reinicia prep ni remonta el visor. */
  const [viewPage, setViewPage] = useState(1);
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [isPdfViewerLoading, setIsPdfViewerLoading] = useState(false);
  const [pdfReloadKey, setPdfReloadKey] = useState(0);
  const [listenLanguage, setListenLanguage] = useState<AppLanguage>("es");
  const [voicePreferenceVersion, setVoicePreferenceVersion] = useState(0);
  const [pagePrepStatus, setPagePrepStatus] = useState<PagePrepStatus>("idle");
  const pagePrepStatusRef = useRef<PagePrepStatus>("idle");
  pagePrepStatusRef.current = pagePrepStatus;

  const playingRef = useRef(false);
  const pausedRef = useRef(false);
  const documentRef = useRef(document);
  const engineRef = useRef(new PlaybackEngine(getPlaybackAudioRoot));
  const audioPlayerRef = useRef(new WavAudioPlayer());
  const syncControllerRef = useRef(new NarrationSyncController());
  const subtitleCacheRef = useRef(new Map<string, string>());
  const activeChunkIndexRef = useRef(-1);
  const currentPrepRef = useRef<PreparePageTextResult | null>(null);
  const showOppositeSubtitlesRef = useRef(false);
  const listenLanguageRef = useRef(listenLanguage);
  const isPdfViewerLoadingRef = useRef(false);
  const pdfLoadSessionRef = useRef(0);
  const pdfLoadTimeoutRef = useRef<number | null>(null);
  const rustPdfReadyRef = useRef<Promise<void>>(Promise.resolve());
  const currentPageRef = useRef(currentPage);
  const viewPageRef = useRef(viewPage);

  documentRef.current = document;
  isPdfViewerLoadingRef.current = isPdfViewerLoading;
  listenLanguageRef.current = listenLanguage;
  currentPageRef.current = currentPage;
  viewPageRef.current = viewPage;

  /** Estable (usa refs) — no debe cambiar identidad al actualizar `document`. */
  const buildPrepParams = useCallback(
    (page: number, doc?: OpenDocument): PagePrepParams | null => {
      const resolved = doc ?? documentRef.current;
      if (!resolved) return null;
      const lang = listenLanguageRef.current;
      const voice = voiceForLanguage(lang);
      return {
        docPath: resolved.path,
        page,
        listenLanguage: lang,
        modelStem: voice.modelStem,
      };
    },
    [],
  );

  const stopPlayback = useCallback(() => {
    playingRef.current = false;
    pausedRef.current = false;
    audioPlayerRef.current.stop();
    syncControllerRef.current.endChunk();
    activeChunkIndexRef.current = -1;
    currentPrepRef.current = null;
  }, []);

  const resolveSubtitle = useCallback(
    async (
      prep: PreparePageTextResult,
      chunkIndex: number,
    ): Promise<string | null> => {
      if (!showOppositeSubtitlesRef.current) {
        return null;
      }

      if (prep.translated) {
        const lastSource =
          prep.source_chunks[prep.source_chunks.length - 1];
        return prep.source_chunks[chunkIndex] ?? lastSource ?? null;
      }

      const chunk =
        prep.chunks[chunkIndex] ?? prep.source_chunks[chunkIndex];
      if (!chunk) {
        return null;
      }

      const listenLang = listenLanguageRef.current;
      const opposite = oppositeLanguage(listenLang);
      const cacheKey = `${listenLang}|${opposite}|${chunk}`;
      const cached = subtitleCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }

      const translated = await translateText(chunk, listenLang, opposite);
      subtitleCacheRef.current.set(cacheKey, translated);
      return translated;
    },
    [],
  );

  const refreshSubtitleForCurrentChunk = useCallback(() => {
    if (!showOppositeSubtitlesRef.current) {
      syncControllerRef.current.updateSubtitle(null);
      return;
    }

    const prep = currentPrepRef.current;
    const chunkIndex = activeChunkIndexRef.current;
    if (!prep || chunkIndex < 0) {
      syncControllerRef.current.updateSubtitle(null);
      return;
    }

    void resolveSubtitle(prep, chunkIndex).then((text) => {
      if (
        showOppositeSubtitlesRef.current &&
        currentPrepRef.current === prep &&
        activeChunkIndexRef.current === chunkIndex
      ) {
        syncControllerRef.current.updateSubtitle(text);
      }
    });
  }, [resolveSubtitle]);

  const finishPdfLoad = useCallback((session: number) => {
    if (session !== pdfLoadSessionRef.current) {
      return;
    }
    if (pdfLoadTimeoutRef.current !== null) {
      window.clearTimeout(pdfLoadTimeoutRef.current);
      pdfLoadTimeoutRef.current = null;
    }
    isPdfViewerLoadingRef.current = false;
    setIsPdfViewerLoading(false);
  }, []);

  const loadPdfFromPath = useCallback(
    async (path: string) => {
      const session = ++pdfLoadSessionRef.current;
      const previousPath = documentRef.current?.path;
      const isFirstOpen = !documentRef.current;

      stopPlayback();
      engineRef.current.cancelAll();
      subtitleCacheRef.current.clear();
      resetPagePrepSnapshot();
      setPagePrepStatus("idle");
      setError(null);
      setOpenError(null);
      isPdfViewerLoadingRef.current = true;
      setIsPdfViewerLoading(true);
      setPdfReloadKey((key) => key + 1);
      setStatus("opening");
      setListenLanguage("es");
      currentPageRef.current = 1;
      viewPageRef.current = 1;
      setCurrentPage(1);
      setViewPage(1);
      setDocument({
        path,
        name: fileNameFromPath(path),
        pageCount: 0,
        fileSizeBytes: 0,
        detectedLanguage: null,
      });
      setStatusMessage("Cargando visor PDF…");

      if (isFirstOpen) {
        await waitForUiPaint();
      }

      if (pdfLoadTimeoutRef.current !== null) {
        window.clearTimeout(pdfLoadTimeoutRef.current);
      }
      pdfLoadTimeoutRef.current = window.setTimeout(() => {
        if (
          session !== pdfLoadSessionRef.current ||
          !isPdfViewerLoadingRef.current
        ) {
          return;
        }
        finishPdfLoad(session);
        setOpenError(
          "La carga del visor tardó demasiado. Prueba con otro PDF o reinicia la app.",
        );
        setStatus("idle");
        setStatusMessage("");
      }, PDF_VIEWER_LOAD_TIMEOUT_MS);

      rustPdfReadyRef.current = openPdf(path)
        .then((metadata) => {
          if (session !== pdfLoadSessionRef.current) {
            return;
          }
          setDocument((prev) =>
            prev?.path === path
              ? {
                  ...prev,
                  pageCount: metadata.page_count,
                  fileSizeBytes: metadata.file_size_bytes,
                }
              : prev,
          );
          void preloadPdf(path).then((pageCount) => {
            if (
              pageCount > 0 &&
              session === pdfLoadSessionRef.current &&
              documentRef.current?.path === path
            ) {
              setDocument((prev) =>
                prev?.path === path ? { ...prev, pageCount } : prev,
              );
            }
          });
        })
        .catch((err: unknown) => {
          if (session !== pdfLoadSessionRef.current) {
            return;
          }
          const message =
            err instanceof Error ? err.message : "No se pudo abrir el PDF";
          finishPdfLoad(session);
          setOpenError(message);
          setStatus("idle");
          setStatusMessage("");
        });

      if (previousPath && previousPath !== path) {
        void rustPdfReadyRef.current.finally(() => {
          if (session === pdfLoadSessionRef.current) {
            void closePdf(previousPath);
          }
        });
      }
    },
    [finishPdfLoad, stopPlayback],
  );

  const openDocument = useCallback(async () => {
    const hadDocument = Boolean(documentRef.current);
    if (hadDocument) {
      setStatus("opening");
      setStatusMessage("Selecciona un archivo…");
    }

    try {
      const path = await pickPdfFile();
      if (!path) {
        if (hadDocument) {
          setStatus("ready");
          setStatusMessage("");
        } else {
          setStatus("idle");
          setStatusMessage("");
        }
        return;
      }
      await loadPdfFromPath(path);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No se pudo abrir el PDF";
      finishPdfLoad(pdfLoadSessionRef.current);
      setOpenError(message);
      setStatus("idle");
      setStatusMessage("");
    }
  }, [finishPdfLoad, loadPdfFromPath]);

  const handleDocumentReady = useCallback(
    (pageCount: number) => {
      if (!isPdfViewerLoadingRef.current) {
        return;
      }

      const session = pdfLoadSessionRef.current;
      setDocument((prev) =>
        prev && pageCount > 0 ? { ...prev, pageCount } : prev,
      );
      finishPdfLoad(session);
      setStatus("ready");
      setStatusMessage("Preparando audio en segundo plano…");
    },
    [finishPdfLoad],
  );

  const handleDocumentLoadError = useCallback(
    (message: string) => {
      if (!isPdfViewerLoadingRef.current) {
        return;
      }
      finishPdfLoad(pdfLoadSessionRef.current);
      setOpenError(message);
      setStatus("idle");
      setStatusMessage("");
    },
    [finishPdfLoad],
  );

  const dismissOpenError = useCallback(() => {
    finishPdfLoad(pdfLoadSessionRef.current);
    setOpenError(null);
    setStatus("idle");
    setStatusMessage("");
  }, [finishPdfLoad]);

  const retainPagesAround = useCallback(
    (page: number, doc: OpenDocument) => {
      const maxPage =
        doc.pageCount > 0 ? doc.pageCount : Math.max(page, 1);
      const retain: PagePrepParams[] = [];
      const currentParams = buildPrepParams(page, doc);
      if (!currentParams) {
        return;
      }
      retain.push(currentParams);
      if (page < maxPage) {
        const nextParams = buildPrepParams(page + 1, doc);
        if (nextParams) {
          retain.push(nextParams);
        }
      }
      engineRef.current.retainOnly(retain);
    },
    [buildPrepParams],
  );

  /** Solo sincroniza página al hacer scroll (sin resetear prep ni mensajes). */
  const syncViewPage = useCallback(
    (page: number) => {
      if (!document || playingRef.current) {
        return;
      }
      if (isScrollSpySuppressed() || isScrollSpyBlockedForLayout()) {
        devDiag("scroll-spy", "syncViewPage blocked", {
          page,
          suppressed: isScrollSpySuppressed(),
          layoutBlock: isScrollSpyBlockedForLayout(),
        });
        return;
      }
      const maxPage =
        document.pageCount > 0
          ? document.pageCount
          : Math.max(viewPageRef.current, 1);
      const next = Math.min(Math.max(page, 1), maxPage);
      if (next === viewPageRef.current) {
        return;
      }

      devDiag("scroll-spy", "syncViewPage", {
        from: viewPageRef.current,
        to: next,
        prepPage: currentPageRef.current,
      });
      viewPageRef.current = next;
      setViewPage(next);
    },
    [document],
  );

  const goToPage = useCallback(
    (page: number) => {
      if (!document) return;
      const maxPage =
        document.pageCount > 0
          ? document.pageCount
          : Math.max(currentPageRef.current, 1);
      const next = Math.min(Math.max(page, 1), maxPage);
      if (next === currentPageRef.current && next === viewPageRef.current) {
        return;
      }

      stopPlayback();
      retainPagesAround(next, document);

      currentPageRef.current = next;
      viewPageRef.current = next;
      setCurrentPage(next);
      setViewPage(next);
      resetPagePrepSnapshot();
      setPagePrepStatus("analyzing");
      setStatus("ready");
      setStatusMessage(`Página ${next}. Preparando audio…`);
      setError(null);
    },
    [document, retainPagesAround, stopPlayback],
  );

  const runPlayback = useCallback(async () => {
    const doc = documentRef.current;
    if (!doc) return;

    const engine = engineRef.current;
    const player = audioPlayerRef.current;

    const sessionVoice = voiceForLanguage(listenLanguage);
    const startPage = currentPageRef.current;
    const lastPage = doc.pageCount > 0 ? doc.pageCount : startPage;

    const sessionParams = (page: number): PagePrepParams => ({
      docPath: doc.path,
      page,
      listenLanguage,
      modelStem: sessionVoice.modelStem,
    });

    playingRef.current = true;
    pausedRef.current = false;
    player.setPauseRequested(false);

    try {
      for (
        let page = startPage;
        page <= lastPage && playingRef.current;
        page += 1
      ) {
        if (page !== startPage) {
          currentPageRef.current = page;
          viewPageRef.current = page;
          setCurrentPage(page);
          setViewPage(page);
        }

        const params = sessionParams(page);

        setStatus("preparing");
        setStatusMessage(`Preparando página ${page}…`);

        const session = await engine.waitForFirstChunk(params);
        if (session.status === "error") {
          throw new Error(session.error ?? "No se pudo preparar la página");
        }

        engine.startBackgroundChunkPrep(params);

        const prep = session.result;
        const totalChunks = prep
          ? prep.chunks.length || prep.source_chunks.length
          : 0;
        if (!prep || totalChunks === 0) {
          setStatusMessage(`Página ${page} sin texto. Saltando…`);
          continue;
        }

        currentPrepRef.current = prep;

        if (
          prep.detected_language === "es" ||
          prep.detected_language === "en"
        ) {
          setDocument((prev) =>
            prev
              ? {
                  ...prev,
                  detectedLanguage: prep.detected_language as AppLanguage,
                }
              : prev,
          );
        }
        let nextChunkPromise: Promise<ChunkAudioBundle> | null = null;

        for (let i = 0; i < totalChunks && playingRef.current; i += 1) {
          while (pausedRef.current && playingRef.current) {
            await new Promise((r) => setTimeout(r, 100));
          }
          if (!playingRef.current) break;

          activeChunkIndexRef.current = i;

          const sourceText =
            prep.source_chunks[i] ??
            prep.highlight_chunks[i] ??
            prep.chunks[i] ??
            "";

          if (i > 0) {
            setStatus("preparing");
            setStatusMessage(
              `Página ${page} — fragmento ${i + 1} de ${totalChunks}`,
            );
          }

          const chunkBundle = await (nextChunkPromise ??
            engine.getChunkBundle(params, i));

          if (i + 1 < totalChunks) {
            nextChunkPromise = engine.getChunkBundle(params, i + 1);
          } else {
            nextChunkPromise = null;
          }

          if (!playingRef.current) break;

          while (pausedRef.current && playingRef.current) {
            await new Promise((r) => setTimeout(r, 100));
          }
          if (!playingRef.current) break;

          const subtitle = await resolveSubtitle(prep, i);
          if (!playingRef.current || activeChunkIndexRef.current !== i) {
            break;
          }

          while (pausedRef.current && playingRef.current) {
            await new Promise((r) => setTimeout(r, 100));
          }
          if (!playingRef.current) {
            break;
          }

          setStatus("playing");
          setStatusMessage(
            `Página ${page} — reproduciendo ${i + 1} de ${totalChunks}`,
          );

          const sync = syncControllerRef.current;
          sync.beginChunk(sourceText, subtitle, chunkBundle.alignment);
          player.setPauseRequested(pausedRef.current);
          player.setTickHandler((state) => sync.onAudioTick(state));

          await player.play(chunkBundle.path);

          player.setTickHandler(null);
          sync.endChunk();

          while (pausedRef.current && playingRef.current) {
            await new Promise((r) => setTimeout(r, 100));
          }
        }

        syncControllerRef.current.endChunk();
        activeChunkIndexRef.current = -1;
        currentPrepRef.current = null;

        if (page + 1 <= lastPage && playingRef.current) {
          engine.prefetch(sessionParams(page + 1));
        }
      }

      if (playingRef.current) {
        setStatus("ready");
        setStatusMessage("Lectura completada.");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error durante la reproducción";
      setError(message);
      setStatus("error");
      setStatusMessage(message);
    } finally {
      playingRef.current = false;
      pausedRef.current = false;
      player.stop();
      syncControllerRef.current.endChunk();
      activeChunkIndexRef.current = -1;
      currentPrepRef.current = null;
    }
  }, [listenLanguage, resolveSubtitle]);

  const play = useCallback(() => {
    if (!document) {
      void openDocument();
      return;
    }

    if (
      status === "paused" &&
      playingRef.current &&
      audioPlayerRef.current.getElement()
    ) {
      pausedRef.current = false;
      audioPlayerRef.current.setPauseRequested(false);
      setStatus("playing");
      refreshSubtitleForCurrentChunk();
      void audioPlayerRef.current.resume().catch(() => undefined);
      return;
    }

    if (
      status === "preparing" ||
      status === "playing" ||
      playingRef.current
    ) {
      return;
    }

    if (viewPageRef.current !== currentPageRef.current) {
      goToPage(viewPageRef.current);
    }

    void runPlayback();
  }, [
    document,
    goToPage,
    openDocument,
    refreshSubtitleForCurrentChunk,
    runPlayback,
    status,
  ]);

  const pause = useCallback(() => {
    if (!playingRef.current) return;
    pausedRef.current = true;
    setStatus("paused");
    setStatusMessage("Pausado.");
    audioPlayerRef.current.setPauseRequested(true);
    audioPlayerRef.current.pause();
  }, []);

  const handleListenLanguageChange = useCallback(
    (language: AppLanguage) => {
      if (language === listenLanguageRef.current) {
        return;
      }

      stopPlayback();
      engineRef.current.cancelAll();
      subtitleCacheRef.current.clear();
      resetPagePrepSnapshot();
      setPagePrepStatus("analyzing");
      syncControllerRef.current.endChunk();
      setListenLanguage(language);
      setStatus("ready");
      setStatusMessage("Cambiando idioma de lectura…");
      setError(null);
    },
    [stopPlayback],
  );

  const handleVoicePreferenceChange = useCallback(() => {
    stopPlayback();
    engineRef.current.cancelAll();
    subtitleCacheRef.current.clear();
    resetPagePrepSnapshot();
    setPagePrepStatus("analyzing");
    syncControllerRef.current.endChunk();
    setVoicePreferenceVersion((version) => version + 1);
    setStatus("ready");
    setStatusMessage("Cambiando voz de narración…");
    setError(null);
  }, [stopPlayback]);

  const handleSubtitleVisibilityChange = useCallback(
    (enabled: boolean) => {
      if (!playingRef.current && activeChunkIndexRef.current < 0) {
        return;
      }
      if (!enabled) {
        requestAnimationFrame(() => {
          syncControllerRef.current.updateSubtitle(null);
        });
        return;
      }
      queueMicrotask(() => refreshSubtitleForCurrentChunk());
    },
    [refreshSubtitleForCurrentChunk],
  );

  const closeDocument = useCallback(() => {
    const path = documentRef.current?.path;
    pdfLoadSessionRef.current += 1;

    stopPlayback();
    engineRef.current.cancelAll();
    syncControllerRef.current.endChunk();
    subtitleCacheRef.current.clear();
    activeChunkIndexRef.current = -1;
    currentPrepRef.current = null;
    resetPagePrepSnapshot();
    setPagePrepStatus("idle");
    setDocument(null);
    currentPageRef.current = 1;
    viewPageRef.current = 1;
    setCurrentPage(1);
    setViewPage(1);
    setStatus("idle");
    setStatusMessage("");
    setError(null);
    setOpenError(null);
    isPdfViewerLoadingRef.current = false;
    setIsPdfViewerLoading(false);
    setPdfReloadKey((key) => key + 1);

    if (pdfLoadTimeoutRef.current !== null) {
      window.clearTimeout(pdfLoadTimeoutRef.current);
      pdfLoadTimeoutRef.current = null;
    }

    if (path) {
      void closePdf(path);
    }
  }, [stopPlayback]);

  useEffect(() => {
    if (showOppositeSubtitlesRef.current) {
      refreshSubtitleForCurrentChunk();
    }
  }, [listenLanguage, refreshSubtitleForCurrentChunk]);

  useEffect(() => {
    void getPlaybackAudioRoot();
  }, []);

  useEffect(() => {
    const params = buildPrepParams(currentPage);
    if (!params || !document?.path) {
      resetPagePrepSnapshot();
      setPagePrepStatus("idle");
      return;
    }

    if (isPdfViewerLoading) {
      setPagePrepStatus("analyzing");
      setPagePrepSnapshot({
        status: "analyzing",
        totalChunks: 0,
        chunksPrepared: 0,
      });
      return;
    }

    if (playingRef.current) {
      return;
    }

    const cachedProgress = engineRef.current.getProgress(params);
    if (cachedProgress.status === "ready") {
      pagePrepStatusRef.current = "ready";
      setPagePrepStatus("ready");
      setPagePrepSnapshot(cachedProgress);
      if (!playingRef.current) {
        setStatus("ready");
        setStatusMessage(PLAYER_READY_MESSAGE);
      }
      devDiag("prep", "cache hit ready", { page: params.page });
      return;
    }

    let cancelled = false;
    let prepId: number | null = null;
    let unsubscribe: (() => void) | null = null;

    const startPrep = () => {
      if (cancelled || playingRef.current) {
        return;
      }

      const existing = engineRef.current.getProgress(params);
      if (existing.status === "ready") {
        devDiag("prep", "skip already ready", { page: params.page });
        setPagePrepStatus("ready");
        setPagePrepSnapshot(existing);
        if (!playingRef.current) {
          setStatus("ready");
          setStatusMessage(PLAYER_READY_MESSAGE);
        }
        return;
      }

      devDiag("prep", "startPrep", { page: params.page });
      setPagePrepStatus("analyzing");
      setPagePrepSnapshot({
        status: "analyzing",
        totalChunks: 0,
        chunksPrepared: 0,
      });

      unsubscribe = engineRef.current.subscribeProgress(params, (snapshot) => {
        if (cancelled) {
          return;
        }
        setPagePrepSnapshot(snapshot);
        if (snapshot.status !== pagePrepStatusRef.current) {
          pagePrepStatusRef.current = snapshot.status;
          setPagePrepStatus(snapshot.status);
          devDiag("prep", "status", {
            status: snapshot.status,
            chunks: snapshot.chunksPrepared,
            total: snapshot.totalChunks,
          });
        }
        if (!playingRef.current) {
          if (snapshot.status === "synthesizing") {
            setStatusMessage("Generando primer fragmento de audio…");
          } else if (snapshot.status === "analyzing") {
            setStatusMessage("Analizando texto de la página…");
          }
        }
      });

      const session = engineRef.current.ensurePage(params);
      prepId = session.prepId;

      if (!playingRef.current) {
        setStatusMessage("Analizando texto de la página…");
      }

      void session.firstChunkReady.then(() => {
        if (cancelled) {
          return;
        }

        const current = engineRef.current.getSession(params);
        if (!current || current.prepId !== prepId) {
          devDiag("prep", "firstChunkReady stale session", {
            prepId,
            currentPrepId: current?.prepId,
          });
          return;
        }

        if (current.status === "error") {
          setPagePrepStatus("error");
          const message = current.error ?? "No se pudo preparar el audio";
          setError(message);
          setStatus("error");
          setStatusMessage(message);
          return;
        }

        setPagePrepStatus("ready");
        setError(null);

        if (current.result) {
          const detected = current.result.detected_language;
          if (detected === "es" || detected === "en") {
            setDocument((prev) => {
              if (!prev || prev.detectedLanguage === detected) {
                return prev;
              }
              return { ...prev, detectedLanguage: detected as AppLanguage };
            });
          }
        }

        devDiag("prep", "firstChunkReady OK", { page: params.page });

        if (!playingRef.current) {
          setStatus("ready");
          setStatusMessage(
            PLAYER_READY_MESSAGE,
          );
        }
      });
    };

    void rustPdfReadyRef.current.then(() => {
      if (!cancelled) {
        startPrep();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      devDiag("prep", "effect cleanup", { page: params.page });
    };
  }, [
    currentPage,
    document?.path,
    isPdfViewerLoading,
    listenLanguage,
    voicePreferenceVersion,
  ]);

  useEffect(() => {
    return () => {
      playingRef.current = false;
      audioPlayerRef.current.stop();
      engineRef.current.cancelAll();
      const path = documentRef.current?.path;
      if (path) {
        void closePdf(path);
      }
    };
  }, []);

  return {
    document,
    currentPage,
    viewPage,
    status,
    statusMessage,
    error,
    openError,
    syncController: syncControllerRef.current,
    isPdfViewerLoading,
    pdfReloadKey,
    pagePrepStatus,
    openDocument,
    loadPdfFromPath,
    play,
    pause,
    goToPage,
    syncViewPage,
    dismissOpenError,
    handleDocumentReady,
    handleDocumentLoadError,
    listenLanguage,
    setListenLanguage: handleListenLanguageChange,
    handleVoicePreferenceChange,
    showOppositeSubtitlesRef,
    handleSubtitleVisibilityChange,
    closeDocument,
    canPlay:
      Boolean(document) &&
      status !== "opening" &&
      pagePrepStatus === "ready" &&
      (status === "ready" ||
        status === "paused" ||
        status === "idle" ||
        status === "error"),
    canPause: status === "playing" || status === "preparing",
  };
}
