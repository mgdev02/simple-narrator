import { memo, useEffect, useRef, useState, type RefObject } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { cn } from "@/lib/utils";

const THUMB_WIDTH_DEFAULT = 88;
const THUMB_WIDTH_COMPACT = 64;
const THUMB_RENDER_CONCURRENCY = 2;

let thumbRenderActive = 0;
const thumbRenderQueue: Array<() => void> = [];

function scheduleThumbRender(task: () => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    const run = () => {
      thumbRenderActive += 1;
      void task()
        .then(resolve, reject)
        .finally(() => {
          thumbRenderActive -= 1;
          const next = thumbRenderQueue.shift();
          if (next) {
            next();
          }
        });
    };

    if (thumbRenderActive < THUMB_RENDER_CONCURRENCY) {
      run();
    } else {
      thumbRenderQueue.push(run);
    }
  });
}

interface PdfPageThumbnailsProps {
  pdfDoc: PDFDocumentProxy;
  pageCount: number;
  currentPage: number;
  onPageSelect: (page: number) => void;
  compact?: boolean;
}

const PageThumbnail = memo(function PageThumbnail({
  pdfDoc,
  pageNumber,
  isActive,
  thumbWidth,
  scrollRoot,
  onSelect,
}: {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  isActive: boolean;
  thumbWidth: number;
  scrollRoot: RefObject<HTMLDivElement | null>;
  onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (isActive) {
      buttonRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }, [isActive]);

  useEffect(() => {
    const root = scrollRoot.current;
    const target = buttonRef.current;
    if (!root || !target) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
        }
      },
      { root, rootMargin: "120px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    if (!inView) {
      return;
    }

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const renderThumb = async () => {
      const page = await pdfDoc.getPage(pageNumber);
      if (cancelled) {
        return;
      }

      const baseViewport = page.getViewport({ scale: 1 });
      const scale = thumbWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext("2d");
      if (!context || cancelled) {
        return;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;
    };

    void scheduleThumbRender(renderThumb).catch(() => {
      // miniatura opcional; fallo silencioso
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [inView, pdfDoc, pageNumber, thumbWidth]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex w-full flex-col items-center gap-1.5 rounded-md p-1 transition-colors",
        isActive ? "bg-primary/15" : "hover:bg-muted/50",
      )}
      aria-label={`Ir a página ${pageNumber}`}
      aria-current={isActive ? "page" : undefined}
    >
      <span
        className={cn(
          "block overflow-hidden bg-white shadow-sm ring-1 ring-border/60 transition-shadow",
          isActive && "ring-2 ring-primary shadow-md",
          !inView && "min-h-[72px]",
        )}
        style={{ width: thumbWidth }}
      >
        <canvas
          ref={canvasRef}
          className="block h-auto w-full"
        />
      </span>
      <span
        className={cn(
          "text-[10px] tabular-nums",
          isActive
            ? "font-medium text-primary"
            : "text-muted-foreground group-hover:text-foreground",
        )}
      >
        {pageNumber}
      </span>
    </button>
  );
});

export const PdfPageThumbnails = memo(function PdfPageThumbnails({
  pdfDoc,
  pageCount,
  currentPage,
  onPageSelect,
  compact = false,
}: PdfPageThumbnailsProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const total = pageCount > 0 ? pageCount : pdfDoc.numPages;
  const thumbWidth = compact ? THUMB_WIDTH_COMPACT : THUMB_WIDTH_DEFAULT;

  return (
    <aside
      className={cn(
        "pdf-viewer-surface flex shrink-0 flex-col border-r border-border/40 bg-muted/20 select-none",
        compact ? "w-[5.5rem]" : "w-[7.25rem]",
      )}
      aria-label="Miniaturas de páginas"
    >
      <div
        ref={scrollRootRef}
        className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto px-1.5 py-3"
      >
        <div className="flex flex-col gap-2">
          {Array.from({ length: total }, (_, i) => i + 1).map((pageNumber) => (
            <PageThumbnail
              key={pageNumber}
              pdfDoc={pdfDoc}
              pageNumber={pageNumber}
              isActive={pageNumber === currentPage}
              thumbWidth={thumbWidth}
              scrollRoot={scrollRootRef}
              onSelect={() => onPageSelect(pageNumber)}
            />
          ))}
        </div>
      </div>
    </aside>
  );
});
