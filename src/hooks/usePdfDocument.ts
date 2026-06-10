import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { pdfjs } from "@/lib/pdfjs";

export function usePdfDocument(filePath: string | null, reloadKey = 0) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) {
      setPdfDoc(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setPdfDoc(null);
    setError(null);

    const loadDocument = async () => {
      try {
        const url = convertFileSrc(filePath);
        const loadingTask = pdfjs.getDocument({
          url,
          disableAutoFetch: true,
          disableStream: false,
        });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          pdf.destroy();
          return;
        }
        setPdfDoc(pdf);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "No se pudo cargar el PDF",
          );
          setPdfDoc(null);
        }
      }
    };

    void loadDocument();

    return () => {
      cancelled = true;
      setPdfDoc((current) => {
        if (current) {
          queueMicrotask(() => current.destroy());
        }
        return null;
      });
    };
  }, [filePath, reloadKey]);

  return {
    pdfDoc,
    error,
    pageCount: pdfDoc?.numPages ?? 0,
  };
}
