import { useSyncExternalStore } from "react";
import type { PagePrepSnapshot } from "@/lib/playbackEngine";
import {
  getPagePrepSnapshot,
  subscribePagePrep,
} from "@/lib/pagePrepStore";

export function usePagePrepSnapshot(): PagePrepSnapshot {
  return useSyncExternalStore(subscribePagePrep, getPagePrepSnapshot, () => ({
    status: "idle",
    totalChunks: 0,
    chunksPrepared: 0,
  }));
}
