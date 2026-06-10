import { useCallback, useEffect } from "react";
import { WindowTitleBar } from "@/components/layout/WindowTitleBar";
import { SubtitleShortcuts } from "@/components/layout/SubtitleShortcuts";
import { ViewerArea } from "@/components/layout/ViewerArea";
import { ViewerLayout } from "@/components/layout/ViewerLayout";
import { DocumentHeader } from "@/components/viewer/DocumentHeader";
import { SubtitleOverlay } from "@/components/viewer/SubtitleOverlay";
import { usePdfDragDrop } from "@/hooks/usePdfDragDrop";
import { useSubtitlePanelWidth } from "@/hooks/useSubtitlePanelWidth";
import { initSubtitleVisibility } from "@/lib/subtitleVisibilityStore";
import { usePodcastPlayer } from "@/hooks/usePodcastPlayer";

export function AppShell() {
  const {
    document,
    currentPage,
    viewPage,
    status,
    statusMessage,
    syncController,
    openDocument,
    play,
    pause,
    goToPage,
    syncViewPage,
    canPlay,
    canPause,
    isPdfViewerLoading,
    pdfReloadKey,
    openError,
    loadPdfFromPath,
    dismissOpenError,
    handleDocumentReady,
    handleDocumentLoadError,
    listenLanguage,
    setListenLanguage,
    showOppositeSubtitlesRef,
    handleSubtitleVisibilityChange,
    closeDocument,
  } = usePodcastPlayer();

  const handleOpen = useCallback(() => {
    void openDocument();
  }, [openDocument]);

  const handleDropPdf = useCallback(
    (path: string) => {
      void loadPdfFromPath(path);
    },
    [loadPdfFromPath],
  );

  const { isDragging } = usePdfDragDrop(handleDropPdf);

  const handlePrevPage = useCallback(() => {
    goToPage(viewPage - 1);
  }, [viewPage, goToPage]);

  const handleNextPage = useCallback(() => {
    goToPage(viewPage + 1);
  }, [viewPage, goToPage]);

  const handlePageVisible = useCallback(
    (page: number) => {
      syncViewPage(page);
    },
    [syncViewPage],
  );

  const handleCloseDocument = useCallback(() => {
    closeDocument();
  }, [closeDocument]);

  useSubtitlePanelWidth();

  useEffect(() => {
    initSubtitleVisibility({
      subtitlesEnabledRef: showOppositeSubtitlesRef,
      onVisibilityChange: handleSubtitleVisibilityChange,
    });
  }, [showOppositeSubtitlesRef, handleSubtitleVisibilityChange]);

  return (
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <WindowTitleBar />

        <DocumentHeader
          document={document}
          status={status}
          currentPage={viewPage}
          listenLanguage={listenLanguage}
          canPlay={canPlay}
          canPause={canPause}
          onCloseDocument={handleCloseDocument}
          onListenLanguageChange={setListenLanguage}
          onPlay={play}
          onPause={pause}
          onPrevPage={handlePrevPage}
          onNextPage={handleNextPage}
          isPdfLoading={isPdfViewerLoading}
          pdfLoadingMessage={statusMessage}
          pdfLoadError={openError}
          onDismissPdfLoadError={dismissOpenError}
        />

        <SubtitleShortcuts
          document={document}
          currentPage={viewPage}
          status={status}
          canPlay={canPlay}
          canPause={canPause}
          shortcutsEnabled={!isPdfViewerLoading}
          onPrevPage={handlePrevPage}
          onNextPage={handleNextPage}
          onPlay={play}
          onPause={pause}
        />

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ViewerArea>
            <ViewerLayout
              hasDocument={Boolean(document)}
              isDragging={isDragging}
              openError={openError}
              filePath={document?.path ?? null}
              viewPage={viewPage}
              syncPage={currentPage}
              pageCount={document?.pageCount ?? 0}
              syncController={syncController}
              isPdfViewerLoading={isPdfViewerLoading}
              loadingMessage={statusMessage}
              pdfReloadKey={pdfReloadKey}
              onOpen={handleOpen}
              onDocumentReady={handleDocumentReady}
              onPageSelect={goToPage}
              onPageVisible={handlePageVisible}
              onDocumentError={handleDocumentLoadError}
            />

            <SubtitleOverlay
              hasDocument={Boolean(document)}
              listenLanguage={listenLanguage}
              syncController={syncController}
            />
          </ViewerArea>
        </main>
      </div>
  );
}
