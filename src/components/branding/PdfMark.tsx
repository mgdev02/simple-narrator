import { cn } from "@/lib/utils";

interface PdfMarkProps {
  className?: string;
}

/** Marca compacta «PDF» para el encabezado de la app. */
export function PdfMark({ className }: PdfMarkProps) {
  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 shadow-sm",
        className,
      )}
      aria-hidden="true"
    >
      <span className="text-[11px] font-bold tracking-tight text-primary">PDF</span>
    </div>
  );
}
