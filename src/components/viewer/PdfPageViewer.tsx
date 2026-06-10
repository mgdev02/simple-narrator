import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { devDiag } from "@/lib/devDiag";
import {
  isScrollSpyBlockedForLayout,
  isScrollSpySuppressed,
  notifyUserScroll,
} from "@/lib/scrollSpySuppress";
import type { NarrationSyncController } from "@/lib/narrationSync";
import { setPdfViewerViewportMetrics } from "@/lib/pdfFitModeStore";
import { PdfPageSlot } from "./PdfPageSlot";

const WIDTH_CHANGE_EPSILON = 8;
const SCROLL_PAGE_DEBOUNCE_MS = 120;

interface PdfPageViewerProps {
  pdfDoc: PDFDocumentProxy | null;
  /** Página de sync / scrollIntoView al navegar explícitamente. */
  pageNumber: number;
  /** Página visible para scroll spy (puede diferir de pageNumber antes de Play). */
  visiblePage: number;
  syncController: NarrationSyncController;
  onPageVisible?: (page: number) => void;
}

export const PdfPageViewer = memo(function PdfPageViewer({
  pdfDoc,
  pageNumber,
  visiblePage,
  syncController,
  onPageVisible,
}: PdfPageViewerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const widthProbeRef = useRef<HTMLDivElement>(null);
  const pageElementsRef = useRef<Map<number, HTMLElement>>(new Map());
  const programmaticScrollRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const scrollDebounceRef = useRef<number | null>(null);
  const onPageVisibleRef = useRef(onPageVisible);
  onPageVisibleRef.current = onPageVisible;

  const [viewportWidth, setViewportWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const pageCount = pdfDoc?.numPages ?? 0;

  useEffect(() => {
    if (viewportWidth > 0 && viewportHeight > 0) {
      setPdfViewerViewportMetrics(viewportWidth, viewportHeight);
    }
  }, [viewportWidth, viewportHeight]);

  useEffect(() => {
    if (pdfDoc) {
      devDiag("pdf-viewer", "mounted", {
        pages: pdfDoc.numPages,
        pageNumber,
      });
    }
  }, [pdfDoc, pageNumber]);

  useEffect(() => {
    if (viewportWidth > 0 || viewportHeight > 0) {
      devDiag("pdf-viewer", "viewport", {
        w: viewportWidth,
        h: viewportHeight,
        scrollRoot: scrollRoot !== null,
      });
    }
  }, [viewportWidth, viewportHeight, scrollRoot]);

  const bindScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setScrollRoot((prev) => (prev === node ? prev : node));
    devDiag("pdf-viewer", "scrollRoot", { bound: node !== null });
  }, []);
  useEffect(() => {
    const probe = widthProbeRef.current;
    if (!probe) return;

    let rafId: number | null = null;

    const commitWidth = () => {
      rafId = null;
      const width = probe.clientWidth;
      if (width <= 0) return;

      setViewportWidth((prev) => {
        if (prev > 0 && Math.abs(prev - width) < WIDTH_CHANGE_EPSILON) {
          return prev;
        }
        return width;
      });
    };

    const scheduleWidthUpdate = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(commitWidth);
    };

    commitWidth();
    const observer = new ResizeObserver(scheduleWidthUpdate);
    observer.observe(probe);

    return () => {
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [pdfDoc]);

  useLayoutEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    let rafId: number | null = null;

    const syncHeight = () => {
      const nextHeight = scrollEl.clientHeight;
      if (nextHeight <= 0) return;
      setViewportHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    const scheduleHeight = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        syncHeight();
      });
    };

    scheduleHeight();
    const observer = new ResizeObserver(scheduleHeight);
    observer.observe(scrollEl);
    return () => {
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [pdfDoc]);

  const registerPageElement = useCallback(
    (page: number, el: HTMLElement | null) => {
      if (el) {
        pageElementsRef.current.set(page, el);
      } else {
        pageElementsRef.current.delete(page);
      }
    },
    [],
  );

  const detectPageFromScroll = useCallback(() => {
    const root = scrollRef.current;
    if (
      !root ||
      programmaticScrollRef.current ||
      isScrollSpySuppressed() ||
      isScrollSpyBlockedForLayout()
    ) {
      return;
    }

    const centerY = root.scrollTop + root.clientHeight * 0.4;
    let bestPage = visiblePage;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const [page, el] of pageElementsRef.current.entries()) {
      const top = el.offsetTop;
      const mid = top + el.offsetHeight / 2;
      const distance = Math.abs(mid - centerY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPage = page;
      }
    }

    if (bestPage !== visiblePage) {
      onPageVisibleRef.current?.(bestPage);
    }
  }, [visiblePage]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const onScroll = () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        if (scrollDebounceRef.current !== null) {
          window.clearTimeout(scrollDebounceRef.current);
        }
        scrollDebounceRef.current = window.setTimeout(() => {
          scrollDebounceRef.current = null;
          detectPageFromScroll();
        }, SCROLL_PAGE_DEBOUNCE_MS);
      });
    };

    const onWheelIntent = (event: WheelEvent) => {
      if (!event.isTrusted || Math.abs(event.deltaY) < 2) {
        return;
      }
      notifyUserScroll();
    };

    const onTouchIntent = (event: TouchEvent) => {
      if (!event.isTrusted) {
        return;
      }
      notifyUserScroll();
    };

    root.addEventListener("scroll", onScroll, { passive: true });
    root.addEventListener("wheel", onWheelIntent, { passive: true });
    root.addEventListener("touchmove", onTouchIntent, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      root.removeEventListener("wheel", onWheelIntent);
      root.removeEventListener("touchmove", onTouchIntent);
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
      if (scrollDebounceRef.current !== null) {
        window.clearTimeout(scrollDebounceRef.current);
      }
    };
  }, [detectPageFromScroll, pageCount]);

  useEffect(() => {
    const el = pageElementsRef.current.get(pageNumber);
    if (!el) {
      return;
    }

    programmaticScrollRef.current = true;
    el.scrollIntoView({ block: "start", behavior: "auto" });

    const t = window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 200);

    return () => window.clearTimeout(t);
  }, [pageNumber]);

  if (!pdfDoc || pageCount === 0) {
    return (
      <div className="h-full min-h-[200px] bg-muted/10" aria-hidden="true" />
    );
  }

  return (
    <div
      ref={bindScrollRef}
      className="pdf-viewer-surface scrollbar-hidden relative h-full w-full min-w-0 overflow-x-hidden overflow-y-auto bg-muted/10"
    >
      <div
        ref={widthProbeRef}
        className="pointer-events-none absolute top-0 left-0 h-0 w-full"
        aria-hidden="true"
      />
      <div
        className="pdf-viewer-inner pdf-viewer-inner-continuous flex w-full min-w-0 flex-col items-center gap-4 p-4"
      >
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((num) => (
          <PdfPageSlot
            key={num}
            pdfDoc={pdfDoc}
            pageNumber={num}
            viewportWidth={viewportWidth}
            isSyncTarget={num === pageNumber}
            syncController={syncController}
            scrollRoot={scrollRoot}
            onPageElement={registerPageElement}
          />
        ))}
      </div>
    </div>
  );
});
