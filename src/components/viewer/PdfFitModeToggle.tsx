import { memo } from "react";
import { MoveHorizontal, MoveVertical } from "lucide-react";
import { usePdfViewerFit } from "@/contexts/PdfViewerFitContext";

/** Icono = modo activo; al pulsar alterna entre ancho y página completa. */
export const PdfFitModeToggle = memo(function PdfFitModeToggle() {
  const { fitMode, toggleFitMode } = usePdfViewerFit();
  const fitWidth = fitMode === "width";

  return (
    <button
      type="button"
      className="tauri-interactive-zone tauri-no-drag inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary transition-colors outline-none hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring"
      aria-pressed={fitWidth}
      aria-label={
        fitWidth
          ? "Ajustado al ancho · pulsa para ver la página completa"
          : "Ajustado a la página · pulsa para ajustar al ancho"
      }
      title={fitWidth ? "Ajustado al ancho" : "Ajustado a la página"}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        toggleFitMode();
      }}
    >
      {fitWidth ? (
        <MoveVertical className="size-3.5" aria-hidden="true" />
      ) : (
        <MoveHorizontal className="size-3.5" aria-hidden="true" />
      )}
    </button>
  );
});
