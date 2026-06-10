import { toggleSubtitleVisibility } from "@/lib/subtitleVisibilityStore";
import { usePlayerKeyboardShortcuts } from "@/hooks/usePlayerKeyboardShortcuts";
import type { OpenDocument, PlayerStatus } from "@/types";

interface SubtitleShortcutsProps {
  document: OpenDocument | null;
  currentPage: number;
  status: PlayerStatus;
  canPlay: boolean;
  canPause: boolean;
  shortcutsEnabled: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  onPlay: () => void;
  onPause: () => void;
}

/** Atajos de teclado — sin suscripción a visibilidad de subtítulos (evita re-render al togglear). */
export function SubtitleShortcuts(props: SubtitleShortcutsProps) {
  usePlayerKeyboardShortcuts({
    ...props,
    onToggleSubtitles: toggleSubtitleVisibility,
  });

  return null;
}
