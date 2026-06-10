import type { PagePrepSnapshot } from "@/lib/playbackEngine";
import type { PlayerStatus } from "@/types";

export function pagePrepPercent(
  snapshot: PagePrepSnapshot,
  isPdfLoading = false,
): number {
  if (isPdfLoading && snapshot.status !== "ready") {
    return 5;
  }
  if (snapshot.status === "idle" || snapshot.status === "error") {
    return 0;
  }
  if (snapshot.status === "analyzing") {
    return 6;
  }
  if (snapshot.totalChunks === 0) {
    return snapshot.status === "ready" ? 100 : 6;
  }
  const ratio = snapshot.chunksPrepared / snapshot.totalChunks;
  return Math.min(100, Math.round(8 + ratio * 92));
}

export function isPagePrepActive(
  snapshot: PagePrepSnapshot,
  isPdfLoading = false,
): boolean {
  if (isPdfLoading && snapshot.status !== "ready") {
    return true;
  }
  if (snapshot.status === "analyzing") {
    return true;
  }
  if (snapshot.status === "error" || snapshot.status === "idle") {
    return false;
  }
  return (
    snapshot.totalChunks > 0 && snapshot.chunksPrepared < snapshot.totalChunks
  );
}

export function shouldShowPrepIndicator(
  snapshot: PagePrepSnapshot,
  playerStatus: PlayerStatus,
  isPdfLoading = false,
): boolean {
  if (playerStatus === "playing" || playerStatus === "preparing") {
    return false;
  }
  if (isPdfLoading && snapshot.status !== "ready") {
    return true;
  }
  if (
    snapshot.status === "idle" ||
    snapshot.status === "error" ||
    snapshot.status === "ready"
  ) {
    return false;
  }
  return true;
}
