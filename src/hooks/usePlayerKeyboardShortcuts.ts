import { useEffect } from "react";
import type { OpenDocument, PlayerStatus } from "@/types";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable=''], [contenteditable='true']",
    ),
  );
}

function hasModifierKey(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey || event.altKey;
}

interface UsePlayerKeyboardShortcutsOptions {
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
  onToggleSubtitles?: () => void;
}

export function usePlayerKeyboardShortcuts({
  document,
  currentPage,
  status,
  canPlay,
  canPause,
  shortcutsEnabled,
  onPrevPage,
  onNextPage,
  onPlay,
  onPause,
  onToggleSubtitles,
}: UsePlayerKeyboardShortcutsOptions) {
  useEffect(() => {
    if (!shortcutsEnabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || hasModifierKey(event)) {
        return;
      }

      const key = event.key;

      if (key === "ArrowLeft" || key === "PageUp") {
        if (!document || currentPage <= 1 || status === "opening") {
          return;
        }
        event.preventDefault();
        onPrevPage();
        return;
      }

      if (key === "ArrowRight" || key === "PageDown") {
        if (
          !document ||
          status === "opening" ||
          currentPage >= document.pageCount
        ) {
          return;
        }
        event.preventDefault();
        onNextPage();
        return;
      }

      if (key === " " || key === "p" || key === "P") {
        if (!document || status === "opening") {
          return;
        }
        event.preventDefault();
        if (canPause) {
          onPause();
        } else if (canPlay) {
          onPlay();
        }
        return;
      }

      if (key === "Escape") {
        if (!canPause) {
          return;
        }
        event.preventDefault();
        onPause();
        return;
      }

      if (key === "s" || key === "S") {
        if (!document || !onToggleSubtitles) {
          return;
        }
        event.preventDefault();
        onToggleSubtitles();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    shortcutsEnabled,
    document,
    currentPage,
    status,
    canPlay,
    canPause,
    onPrevPage,
    onNextPage,
    onPlay,
    onPause,
    onToggleSubtitles,
  ]);
}
