import { memo } from "react";
import { PdfDropZone } from "@/components/pdf/PdfDropZone";
import { PdfReader } from "@/components/viewer/PdfReader";
import type { NarrationSyncController } from "@/lib/narrationSync";

interface ViewerLayoutProps {
  hasDocument: boolean;
  isDragging: boolean;
  openError: string | null;
  filePath: string | null;
  viewPage: number;
  syncPage: number;
  pageCount: number;
  syncController: NarrationSyncController;
  isPdfViewerLoading: boolean;
  loadingMessage: string;
  pdfReloadKey: number;
  onOpen: () => void;
  onDocumentReady: (pageCount: number) => void;
  onPageSelect: (page: number) => void;
  onPageVisible?: (page: number) => void;
  onDocumentError: (message: string) => void;
}

/** Solo el visor PDF — no consume estado de subtítulos (evita re-render al togglear). */
export const ViewerLayout = memo(function ViewerLayout({
  hasDocument,
  isDragging,
  openError,
  filePath,
  viewPage,
  syncPage,
  pageCount,
  syncController,
  isPdfViewerLoading,
  loadingMessage,
  pdfReloadKey,
  onOpen,
  onDocumentReady,
  onPageSelect,
  onPageVisible,
  onDocumentError,
}: ViewerLayoutProps) {
  return (
    <PdfDropZone
      hasDocument={hasDocument}
      isDragging={isDragging}
      openError={openError}
      onOpen={onOpen}
    >
      <PdfReader
        filePath={filePath}
        pageNumber={syncPage}
        visiblePage={viewPage}
        pageCount={pageCount}
        syncController={syncController}
        onDocumentReady={onDocumentReady}
        onPageSelect={onPageSelect}
        onPageVisible={onPageVisible}
        isLoading={isPdfViewerLoading}
        loadingMessage={loadingMessage}
        reloadKey={pdfReloadKey}
        onDocumentError={onDocumentError}
      />
    </PdfDropZone>
  );
});
