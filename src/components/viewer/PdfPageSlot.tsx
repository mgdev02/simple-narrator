import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { devDiag } from "@/lib/devDiag";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { computePdfPageRenderScale } from "@/lib/pdfPageScale";
import type { NarrationSyncController } from "@/lib/narrationSync";
import { pdfjs } from "@/lib/pdfjs";

const HORIZONTAL_PADDING = 32;
const PAGE_RENDER_CONCURRENCY = 1;

let pageRenderActive = 0;
const pageRenderQueue: Array<() => void> = [];

function schedulePageRender(task: () => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const run = () => {
      pageRenderActive += 1;
      void task()
        .then(resolve, reject)
        .finally(() => {
          pageRenderActive -= 1;
          const next = pageRenderQueue.shift();
          if (next) {
            next();
          }
        });
    };

    if (pageRenderActive < PAGE_RENDER_CONCURRENCY) {
      run();
    } else {
      pageRenderQueue.push(run);
    }
  });
}

interface PdfPageSlotProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  viewportWidth: number;
  isSyncTarget: boolean;
  syncController: NarrationSyncController;
  scrollRoot: HTMLElement | null;
  onPageElement: (page: number, el: HTMLElement | null) => void;
}

function pdfPageSlotPropsEqual(
  prev: PdfPageSlotProps,
  next: PdfPageSlotProps,
): boolean {
  if (
    prev.pageNumber !== next.pageNumber ||
    prev.pdfDoc !== next.pdfDoc ||
    prev.viewportWidth !== next.viewportWidth ||
    prev.isSyncTarget !== next.isSyncTarget ||
    prev.scrollRoot !== next.scrollRoot ||
    prev.syncController !== next.syncController ||
    prev.onPageElement !== next.onPageElement
  ) {
    return false;
  }
  return true;
}

export const PdfPageSlot = memo(function PdfPageSlot({
  pdfDoc,
  pageNumber,
  viewportWidth,
  isSyncTarget,
  syncController,
  scrollRoot,
  onPageElement,
}: PdfPageSlotProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const syncRef = useRef(syncController);
  syncRef.current = syncController;

  const [inView, setInView] = useState(false);
  const [layout, setLayout] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    onPageElement(pageNumber, hostRef.current);
    return () => onPageElement(pageNumber, null);
  }, [pageNumber, onPageElement]);

  useEffect(() => {
    const root = scrollRoot;
    const target = hostRef.current;
    if (!root || !target) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          devDiag("pdf-slot", "inView", { page: pageNumber });
          setInView(true);
        }
      },
      { root, rootMargin: "120px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [scrollRoot, pageNumber]);

  useEffect(() => {
    if (!inView) {
      return;
    }
    if (viewportWidth === 0) {
      devDiag("pdf-slot", "skip render", {
        page: pageNumber,
        reason: "viewportWidth=0",
      });
      return;
    }

    let cancelled = false;
    let canvasRenderTask: RenderTask | null = null;
    let textLayerTask: { cancel: () => void } | null = null;

    const renderPage = async () => {
      devDiag("pdf-slot", "render start", {
        page: pageNumber,
        sync: isSyncTarget,
        vw: viewportWidth,
      });

      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) {
        return;
      }

      const canvas = canvasRef.current;
      const textLayerDiv = textLayerRef.current;
      if (!canvas || !textLayerDiv) {
        return;
      }

      const availableWidth = Math.max(0, viewportWidth - HORIZONTAL_PADDING);
      if (availableWidth <= 0) {
        return;
      }

      const baseViewport = page.getViewport({ scale: 1 });
      const scale = computePdfPageRenderScale(
        baseViewport.width,
        baseViewport.height,
        availableWidth,
        0,
        "width",
      );
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext("2d");
      if (!context || cancelled) {
        return;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      textLayerDiv.innerHTML = "";
      textLayerDiv.style.width = `${viewport.width}px`;
      textLayerDiv.style.height = `${viewport.height}px`;

      setLayout({ width: viewport.width, height: viewport.height });

      canvasRenderTask = page.render({ canvasContext: context, viewport });
      await canvasRenderTask.promise;
      if (cancelled) {
        return;
      }

      const textLayer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: textLayerDiv,
        viewport,
      });
      textLayerTask = textLayer;
      await textLayer.render();

      if (!cancelled && isSyncTarget) {
        syncRef.current.attachTextLayer(textLayerDiv);
      }

      if (!cancelled) {
        devDiag("pdf-slot", "render done", {
          page: pageNumber,
          w: viewport.width,
          h: viewport.height,
        });
      }
    };

    void schedulePageRender(renderPage).catch((err) => {
      devDiag("pdf-slot", "render error", {
        page: pageNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return () => {
      cancelled = true;
      canvasRenderTask?.cancel();
      textLayerTask?.cancel();
      if (isSyncTarget) {
        syncRef.current.attachTextLayer(null);
      }
    };
  }, [inView, isSyncTarget, pageNumber, pdfDoc, viewportWidth]);

  const hostCssVars: CSSProperties | undefined = layout
    ? {
        ["--pdf-page-width" as string]: `${layout.width}px`,
        ["--pdf-page-height" as string]: `${layout.height}px`,
      }
    : undefined;

  return (
    <div
      ref={hostRef}
      data-page-number={pageNumber}
      className="pdf-page-host pdf-page-host-continuous shrink-0 overflow-hidden"
      style={
        layout
          ? hostCssVars
          : { minHeight: 120, width: "100%", maxWidth: viewportWidth }
      }
    >
      <div
        className="pdf-page-scaled pdf-page-scaled-continuous relative bg-white shadow-lg"
        style={
          layout
            ? {
                ["--pdf-page-width" as string]: `${layout.width}px`,
                ["--pdf-page-height" as string]: `${layout.height}px`,
              }
            : undefined
        }
      >
        <canvas ref={canvasRef} className="block bg-white" />
        <div
          ref={textLayerRef}
          className="pdf-text-layer absolute inset-0 overflow-hidden"
        />
      </div>
    </div>
  );
}, pdfPageSlotPropsEqual);
