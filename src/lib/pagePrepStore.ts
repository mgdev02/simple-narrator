import type { PagePrepSnapshot } from "@/lib/playbackEngine";

type Listener = () => void;

const EMPTY: PagePrepSnapshot = {
  status: "idle",
  totalChunks: 0,
  chunksPrepared: 0,
};

let snapshot: PagePrepSnapshot = EMPTY;
const listeners = new Set<Listener>();

let flushRaf: number | null = null;
let pending: PagePrepSnapshot | null = null;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function flushPending(): void {
  flushRaf = null;
  if (!pending) {
    return;
  }
  snapshot = pending;
  pending = null;
  notify();
}

/** Actualiza el snapshot de prep; los chunks se agrupan al siguiente frame. */
export function setPagePrepSnapshot(next: PagePrepSnapshot): void {
  const current = pending ?? snapshot;
  const statusChanged = next.status !== current.status;
  const chunksChanged = next.chunksPrepared !== current.chunksPrepared;
  const totalChanged = next.totalChunks !== current.totalChunks;

  if (!statusChanged && !chunksChanged && !totalChanged) {
    return;
  }

  pending = next;

  if (statusChanged || totalChanged) {
    if (flushRaf !== null) {
      cancelAnimationFrame(flushRaf);
      flushRaf = null;
    }
    flushPending();
    return;
  }

  if (flushRaf === null) {
    flushRaf = requestAnimationFrame(flushPending);
  }
}

export function resetPagePrepSnapshot(): void {
  if (flushRaf !== null) {
    cancelAnimationFrame(flushRaf);
    flushRaf = null;
  }
  pending = null;
  snapshot = EMPTY;
  notify();
}

export function subscribePagePrep(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPagePrepSnapshot(): PagePrepSnapshot {
  return pending ?? snapshot;
}
