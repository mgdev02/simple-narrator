import { startTransition } from "react";
import { devDiag } from "@/lib/devDiag";
import { computePdfVisualScale } from "@/lib/pdfPageScale";
import { suppressScrollSpy } from "@/lib/scrollSpySuppress";
import type { PdfViewerFitMode } from "@/contexts/PdfViewerFitContext";

const HORIZONTAL_PADDING = 32;
const VERTICAL_PADDING = 32;
/** Proporción típica A4/Letter para calcular escala visual antes del primer render. */
const DEFAULT_PAGE_WIDTH_PT = 612;
const DEFAULT_PAGE_HEIGHT_PT = 792;

type Listener = () => void;

let fitMode: PdfViewerFitMode = "width";
let viewportWidth = 0;
let viewportHeight = 0;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function availableViewport(): { width: number; height: number } {
  const width = Math.max(0, viewportWidth - HORIZONTAL_PADDING);
  const height = Math.max(0, viewportHeight - VERTICAL_PADDING);
  return { width, height };
}

function currentVisualScale(): number {
  const { width, height } = availableViewport();
  return computePdfVisualScale(
    DEFAULT_PAGE_WIDTH_PT,
    DEFAULT_PAGE_HEIGHT_PT,
    width,
    height,
    fitMode,
  );
}

/** Aplica escala visual en DOM sin re-render de slots PDF (solo CSS). */
export function applyPdfVisualScaleToDom(): void {
  const scale = currentVisualScale();
  const chrome = document.querySelector<HTMLElement>(".pdf-viewer-chrome");
  if (!chrome) {
    return;
  }
  chrome.style.setProperty("--pdf-visual-scale", String(scale));
  chrome.dataset.pdfFitMode = fitMode;
  devDiag("fit", "visual-scale applied", {
    fitMode,
    scale,
    vw: viewportWidth,
    vh: viewportHeight,
  });
}

export function setPdfViewerViewportMetrics(width: number, height: number): void {
  if (width === viewportWidth && height === viewportHeight) {
    return;
  }
  viewportWidth = width;
  viewportHeight = height;
  applyPdfVisualScaleToDom();
}

export function subscribePdfFitMode(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPdfFitModeSnapshot(): PdfViewerFitMode {
  return fitMode;
}

export function togglePdfFitMode(): void {
  fitMode = fitMode === "width" ? "page" : "width";
  devDiag("fit", "toggle", { fitMode });
  suppressScrollSpy(2000, "fit-toggle");
  applyPdfVisualScaleToDom();
  startTransition(() => notify());
}

export function setPdfFitMode(mode: PdfViewerFitMode): void {
  if (fitMode === mode) {
    return;
  }
  fitMode = mode;
  suppressScrollSpy(2000, "fit-set");
  applyPdfVisualScaleToDom();
  startTransition(() => notify());
}
