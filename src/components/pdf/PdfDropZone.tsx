import type { ReactNode } from "react";
import { FileUp } from "lucide-react";
import { AppLogo } from "@/components/branding/AppLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PdfDropZoneProps {
  hasDocument: boolean;
  isDragging: boolean;
  openError: string | null;
  onOpen: () => void;
  children: ReactNode;
}

export function PdfDropZone({
  hasDocument,
  isDragging,
  openError,
  onOpen,
  children,
}: PdfDropZoneProps) {
  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        isDragging && "ring-2 ring-inset ring-primary/60",
      )}
    >
      {children}

      {!hasDocument && (
        <div
          className={cn(
            "absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 p-8 text-center",
            isDragging && "bg-primary/5",
          )}
        >
          <AppLogo size="md" />

          <div className="max-w-md space-y-2">
            <p className="text-base font-medium text-foreground">
              Arrastra un PDF aquí
            </p>
            <p className="text-sm text-muted-foreground">
              O ábrelo desde tu computadora para narrarlo con voz local.
            </p>
          </div>

          <Button type="button" size="lg" className="gap-2" onClick={onOpen}>
            <FileUp className="size-4" />
            Abrir PDF
          </Button>

          {openError && (
            <p className="max-w-md text-sm text-destructive">{openError}</p>
          )}

          {isDragging && (
            <p className="text-sm font-medium text-primary">
              Suelta el archivo para abrirlo
            </p>
          )}
        </div>
      )}
    </div>
  );
}
