import { Captions } from "lucide-react";
import { useEffect, useRef } from "react";
import { languageLabel } from "@/lib/languages";
import type { NarrationSyncController } from "@/lib/narrationSync";
import type { AppLanguage } from "@/types";
import { cn } from "@/lib/utils";

interface SubtitlePanelProps {
  language: AppLanguage;
  syncController: NarrationSyncController;
  visible?: boolean;
  widthPx?: number;
  className?: string;
}

export function SubtitlePanel({
  language,
  syncController,
  visible = true,
  widthPx = 224,
  className,
}: SubtitlePanelProps) {
  const textRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = textRootRef.current;
    syncController.attachSubtitleRoot(root);
    return () => syncController.attachSubtitleRoot(null);
  }, [syncController]);

  return (
    <aside
      className={cn(
        "subtitle-panel absolute inset-y-0 right-0 z-20 flex min-h-0 flex-col overflow-hidden border-l border-border/40 bg-card/95 shadow-lg will-change-transform",
        visible
          ? "subtitle-panel-visible pointer-events-auto opacity-100"
          : "subtitle-panel-hidden pointer-events-none opacity-0",
        className,
      )}
      style={{ width: widthPx }}
      aria-hidden={!visible}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border/40 px-4 py-3">
        <Captions className="size-4 text-primary" />
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Subtítulos · {languageLabel(language)}
        </p>
      </div>
      <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div
          ref={textRootRef}
          className="subtitle-text-root break-words text-sm leading-relaxed text-foreground/95"
        />
        <p className="subtitle-placeholder text-sm text-muted-foreground">
          El texto en {languageLabel(language)} aparecerá aquí al reproducir.
        </p>
      </div>
    </aside>
  );
}
