const MAX_PAGE_SCALE = 4;

export function computePdfPageRenderScale(
  pageWidth: number,
  pageHeight: number,
  availableWidth: number,
  availableHeight: number,
  fitMode: "width" | "page",
): number {
  if (pageWidth <= 0 || pageHeight <= 0 || availableWidth <= 0) {
    return 1;
  }

  const scaleByWidth = availableWidth / pageWidth;

  if (fitMode === "width" || availableHeight <= 0) {
    return Math.min(scaleByWidth, MAX_PAGE_SCALE);
  }

  const scaleByHeight = availableHeight / pageHeight;
  return Math.min(scaleByWidth, scaleByHeight, MAX_PAGE_SCALE);
}

/** Escala CSS para modo «página» cuando el canvas ya está renderizado a ancho completo. */
export function computePdfVisualScale(
  pageWidth: number,
  pageHeight: number,
  availableWidth: number,
  availableHeight: number,
  fitMode: "width" | "page",
): number {
  if (
    fitMode === "width" ||
    pageWidth <= 0 ||
    pageHeight <= 0 ||
    availableWidth <= 0 ||
    availableHeight <= 0
  ) {
    return 1;
  }

  const widthScale = computePdfPageRenderScale(
    pageWidth,
    pageHeight,
    availableWidth,
    0,
    "width",
  );
  if (widthScale <= 0) {
    return 1;
  }

  const pageScale = computePdfPageRenderScale(
    pageWidth,
    pageHeight,
    availableWidth,
    availableHeight,
    "page",
  );
  return pageScale / widthScale;
}
