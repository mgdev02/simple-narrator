import { memo } from "react";
import { Captions, CaptionsOff } from "lucide-react";
import { useSubtitleVisible } from "@/contexts/SubtitleVisibilityContext";
import { toggleSubtitleVisibility } from "@/lib/subtitleVisibilityStore";
import { languageLabel } from "@/lib/languages";
import { cn } from "@/lib/utils";
import type { AppLanguage } from "@/types";

interface DocumentHeaderSubtitleToggleProps {
  subtitleLang: AppLanguage;
}

/** Aislado: solo re-renderiza al togglear subtítulos, no con pagePrep. */
export const DocumentHeaderSubtitleToggle = memo(
  function DocumentHeaderSubtitleToggle({
    subtitleLang,
  }: DocumentHeaderSubtitleToggleProps) {
    const showOppositeSubtitles = useSubtitleVisible();

    return (
      <button
        type="button"
        className={cn(
          "inline-flex h-8 min-w-[9.5rem] cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          showOppositeSubtitles
            ? "border-primary/60 bg-primary/15 text-foreground shadow-sm ring-2 ring-primary/35 hover:bg-primary/20"
            : "border-border/50 bg-muted/10 text-muted-foreground hover:bg-muted/25 hover:text-foreground",
        )}
        aria-pressed={showOppositeSubtitles}
        aria-label="Mostrar u ocultar subtítulos en idioma opuesto"
        onClick={toggleSubtitleVisibility}
      >
        {showOppositeSubtitles ? (
          <Captions className="size-3.5 shrink-0 text-primary" />
        ) : (
          <CaptionsOff className="size-3.5 shrink-0 opacity-60" />
        )}
        <span className="truncate">
          Subtítulos · {languageLabel(subtitleLang)}
        </span>
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full transition-colors",
            showOppositeSubtitles
              ? "bg-primary shadow-[0_0_6px] shadow-primary/60"
              : "bg-muted-foreground/35",
          )}
          aria-hidden="true"
        />
      </button>
    );
  },
);
