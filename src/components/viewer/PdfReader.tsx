import { lazy, memo, Suspense, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { usePdfDocument } from "@/hooks/usePdfDocument";
import type { NarrationSyncController } from "@/lib/narrationSync";
import { PdfPageThumbnails } from "./PdfPageThumbnails";

const PdfPageViewer = lazy(async () => {
  const module = await import("./PdfPageViewer");
  return { default: module.PdfPageViewer };
});

function ViewerLoadingState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

const VIEWER_FALLBACK = <ViewerLoadingState message="Cargando visor PDF…" />;

interface PdfReaderProps {
  filePath: string | null;
  pageNumber: number;
  visiblePage?: number;
  pageCount: number;
  syncController: NarrationSyncController;
  onDocumentReady?: (pageCount: number) => void;
  onPageSelect: (page: number) => void;
  onPageVisible?: (page: number) => void;
  compactLayout?: boolean;
  isLoading?: boolean;
  loadingMessage?: string;
  reloadKey?: number;
  onDocumentError?: (message: string) => void;
}

export const PdfReader = memo(function PdfReader({
  filePath,
  pageNumber,
  visiblePage,
  pageCount,
  syncController,
  onDocumentReady,
  onPageSelect,
  onPageVisible,
  compactLayout = false,
  isLoading = false,
  loadingMessage = "Cargando visor PDF…",
  reloadKey = 0,
  onDocumentError,
}: PdfReaderProps) {
  const { pdfDoc, error: pdfError } = usePdfDocument(filePath, reloadKey);

  useEffect(() => {
    if (pdfDoc && isLoading) {
      onDocumentReady?.(pdfDoc.numPages);
    }
  }, [pdfDoc, isLoading, onDocumentReady]);

  useEffect(() => {
    if (isLoading && filePath && pdfError) {
      onDocumentError?.(pdfError);
    }
  }, [isLoading, filePath, pdfError, onDocumentError]);

  const thumbPageCount =
    pageCount > 0 ? pageCount : pdfDoc?.numPages ?? 0;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      {pdfDoc && thumbPageCount > 0 && !isLoading && (
        <PdfPageThumbnails
          pdfDoc={pdfDoc}
          pageCount={thumbPageCount}
          currentPage={visiblePage ?? pageNumber}
          onPageSelect={onPageSelect}
          compact={compactLayout}
        />
      )}

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {isLoading || (filePath && !pdfDoc) ? (
          <ViewerLoadingState message={loadingMessage} />
        ) : (
          <Suspense fallback={VIEWER_FALLBACK}>
            <PdfPageViewer
              pdfDoc={pdfDoc}
              pageNumber={pageNumber}
              visiblePage={visiblePage ?? pageNumber}
              syncController={syncController}
              onPageVisible={onPageVisible}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
});
