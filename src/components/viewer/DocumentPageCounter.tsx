import { memo } from "react";

interface DocumentPageCounterProps {
  currentPage: number;
  pageCount: number;
}

export const DocumentPageCounter = memo(function DocumentPageCounter({
  currentPage,
  pageCount,
}: DocumentPageCounterProps) {
  return (
    <span
      className="tabular-nums"
      aria-label={
        pageCount > 0
          ? `Página ${currentPage} de ${pageCount}`
          : `Página ${currentPage}`
      }
    >
      Página {currentPage}
      <span className="text-muted-foreground/60"> / </span>
      {pageCount > 0 ? pageCount : "…"}
    </span>
  );
});
