import { useLayoutEffect, type ReactNode } from "react";
import { applyPdfVisualScaleToDom } from "@/lib/pdfFitModeStore";

interface ViewerAreaProps {
  children: ReactNode;
}

/** Contenedor del visor; sin suscripciones de UI para evitar re-render al togglear subtítulos. */
export function ViewerArea({ children }: ViewerAreaProps) {
  useLayoutEffect(() => {
    applyPdfVisualScaleToDom();
  }, []);

  return (
    <div className="pdf-viewer-chrome relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {children}
    </div>
  );
}
