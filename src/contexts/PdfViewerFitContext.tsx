import { useSyncExternalStore } from "react";
import {
  getPdfFitModeSnapshot,
  setPdfFitMode,
  subscribePdfFitMode,
  togglePdfFitMode,
} from "@/lib/pdfFitModeStore";

export type PdfViewerFitMode = "width" | "page";

export function usePdfViewerFit() {
  const fitMode = useSyncExternalStore(
    subscribePdfFitMode,
    getPdfFitModeSnapshot,
    () => "width" as PdfViewerFitMode,
  );

  return {
    fitMode,
    setFitMode: setPdfFitMode,
    toggleFitMode: togglePdfFitMode,
  };
}
