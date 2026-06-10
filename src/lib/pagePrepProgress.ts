import type { PagePrepSnapshot } from "@/lib/playbackEngine";
import type { PlayerStatus } from "@/types";

export function pagePrepPercent(snapshot: PagePrepSnapshot): number {
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

export function isPagePrepActive(snapshot: PagePrepSnapshot): boolean {
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
): boolean {
  if (playerStatus === "playing" || playerStatus === "preparing") {
    return false;
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
