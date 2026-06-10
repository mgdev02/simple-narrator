import { memo } from "react";
import type { PlayerStatus } from "@/types";
import { HeaderPlayControls } from "./HeaderPlayControls";
import { PdfFitModeToggle } from "./PdfFitModeToggle";
import { PrepProgressIndicator } from "./PrepProgressIndicator";

interface DocumentHeaderCenterProps {
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

export const DocumentHeaderCenter = memo(function DocumentHeaderCenter({
  currentPage,
  pageCount,
  status,
  canPlay,
  canPause,
  onPlay,
  onPause,
  onPrevPage,
  onNextPage,
}: DocumentHeaderCenterProps) {
  return (
    <div className="tauri-interactive-zone flex min-w-0 items-center justify-center gap-3">
      <PrepProgressIndicator status={status} />
      <HeaderPlayControls
        currentPage={currentPage}
        pageCount={pageCount}
        status={status}
        canPlay={canPlay}
        canPause={canPause}
        onPlay={onPlay}
        onPause={onPause}
        onPrevPage={onPrevPage}
        onNextPage={onNextPage}
      />
      <PdfFitModeToggle />
    </div>
  );
});
