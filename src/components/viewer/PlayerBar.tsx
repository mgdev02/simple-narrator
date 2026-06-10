import { memo } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlayerStatus } from "@/types";

interface PlayPauseControlProps {
  canPlay: boolean;
  canPause: boolean;
  onPlay: () => void;
  onPause: () => void;
}

export const PlayPauseControl = memo(function PlayPauseControl({
  canPlay,
  canPause,
  onPlay,
  onPause,
}: PlayPauseControlProps) {
  const isPlaying = canPause;

  const handlePlayPause = () => {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="default"
      className="h-8 w-8 shrink-0 p-0 shadow-sm"
      onClick={handlePlayPause}
      disabled={!canPlay && !canPause}
      aria-label={isPlaying ? "Pausar" : "Reproducir"}
    >
      {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
    </Button>
  );
});

interface PagePrevButtonProps {
  disabled: boolean;
  onPrevPage: () => void;
}

export const PagePrevButton = memo(function PagePrevButton({
  disabled,
  onPrevPage,
}: PagePrevButtonProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 px-2.5 text-xs"
      onClick={onPrevPage}
      disabled={disabled}
    >
      Página anterior
    </Button>
  );
});

interface PageNextButtonProps {
  disabled: boolean;
  onNextPage: () => void;
}

export const PageNextButton = memo(function PageNextButton({
  disabled,
  onNextPage,
}: PageNextButtonProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 px-2.5 text-xs"
      onClick={onNextPage}
      disabled={disabled}
    >
      Página siguiente
    </Button>
  );
});

interface PlayerControlsProps {
  pageCount: number;
  currentPage: number;
  status: PlayerStatus;
  canPlay: boolean;
  canPause: boolean;
  onPlay: () => void;
  onPause: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export const PlayerControls = memo(function PlayerControls({
  pageCount,
  currentPage,
  status,
  canPlay,
  canPause,
  onPlay,
  onPause,
  onPrevPage,
  onNextPage,
}: PlayerControlsProps) {
  const isBusy =
    status === "opening" || status === "preparing" || status === "playing";
  const prevDisabled = currentPage <= 1 || isBusy;
  const nextDisabled =
    (pageCount > 0 && currentPage >= pageCount) || isBusy;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <PagePrevButton disabled={prevDisabled} onPrevPage={onPrevPage} />
      <PlayPauseControl
        canPlay={canPlay}
        canPause={canPause}
        onPlay={onPlay}
        onPause={onPause}
      />
      <PageNextButton disabled={nextDisabled} onNextPage={onNextPage} />
    </div>
  );
});
