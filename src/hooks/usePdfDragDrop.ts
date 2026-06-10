import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

function isPdfPath(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

function firstPdfPath(paths: string[]): string | null {
  return paths.find(isPdfPath) ?? null;
}

export function usePdfDragDrop(onDropPdf: (path: string) => void) {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter") {
          setIsDragging(firstPdfPath(payload.paths) !== null);
        } else if (payload.type === "over") {
          // mantener estado mientras arrastra
        } else if (payload.type === "leave") {
          setIsDragging(false);
        } else if (payload.type === "drop") {
          setIsDragging(false);
          const pdfPath = firstPdfPath(payload.paths);
          if (pdfPath) {
            onDropPdf(pdfPath);
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, [onDropPdf]);

  return { isDragging };
}
