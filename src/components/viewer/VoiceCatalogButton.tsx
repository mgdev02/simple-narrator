import { memo } from "react";
import { Speech } from "lucide-react";

interface VoiceCatalogButtonProps {
  onOpen: () => void;
}

export const VoiceCatalogButton = memo(function VoiceCatalogButton({
  onOpen,
}: VoiceCatalogButtonProps) {
  return (
    <button
      type="button"
      className="tauri-interactive-zone tauri-no-drag inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border/50 bg-muted/20 text-muted-foreground transition-colors outline-none hover:bg-muted/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="Gestionar voces Piper"
      title="Voces Piper"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <Speech className="size-3.5" aria-hidden="true" />
    </button>
  );
});
