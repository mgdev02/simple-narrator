import { memo } from "react";
import type { PlayerStatus } from "@/types";
import { PlayerControls } from "./PlayerBar";

interface HeaderPlayControlsProps {
  currentPage: number;
  pageCount: number;
  status: PlayerStatus;
  canPlay: boolean;
  canPause: boolean;
  onPlay: () => void;
  onPause: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

/** Reproductor sin indicador de prep — no re-renderiza con el progreso de síntesis. */
export const HeaderPlayControls = memo(function HeaderPlayControls({
  currentPage,
  pageCount,
  status,
  canPlay,
  canPause,
  onPlay,
  onPause,
  onPrevPage,
  onNextPage,
}: HeaderPlayControlsProps) {
  return (
    <PlayerControls
      pageCount={pageCount}
      currentPage={currentPage}
      status={status}
      canPlay={canPlay}
      canPause={canPause}
      onPlay={onPlay}
      onPause={onPause}
      onPrevPage={onPrevPage}
      onNextPage={onNextPage}
    />
  );
});
