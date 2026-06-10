import { startTransition, type MutableRefObject } from "react";
import { devDiag } from "@/lib/devDiag";
import { suppressScrollSpy } from "@/lib/scrollSpySuppress";

type Listener = () => void;

let visible = false;
let panelWidthPx = 224;
const visibilityListeners = new Set<Listener>();
const panelWidthListeners = new Set<Listener>();

let subtitlesEnabledRef: MutableRefObject<boolean> | null = null;
let onVisibilityChange: ((enabled: boolean) => void) | null = null;

function notifyVisibility() {
  for (const listener of visibilityListeners) {
    listener();
  }
}

function notifyPanelWidth() {
  for (const listener of panelWidthListeners) {
    listener();
  }
}

export function initSubtitleVisibility(options: {
  subtitlesEnabledRef: MutableRefObject<boolean>;
  onVisibilityChange?: (enabled: boolean) => void;
}): void {
  subtitlesEnabledRef = options.subtitlesEnabledRef;
  onVisibilityChange = options.onVisibilityChange ?? null;
  subtitlesEnabledRef.current = visible;
}

export function setSubtitlePanelWidth(px: number): void {
  if (panelWidthPx === px) {
    return;
  }
  panelWidthPx = px;
  notifyPanelWidth();
}

export function subscribeSubtitleVisibility(listener: Listener): () => void {
  visibilityListeners.add(listener);
  return () => visibilityListeners.delete(listener);
}

export function subscribeSubtitlePanelWidth(listener: Listener): () => void {
  panelWidthListeners.add(listener);
  return () => panelWidthListeners.delete(listener);
}

export function getSubtitleVisibilitySnapshot(): boolean {
  return visible;
}

export function getSubtitlePanelWidthSnapshot(): number {
  return panelWidthPx;
}

function commitVisibilityUi(): void {
  startTransition(() => {
    notifyVisibility();
    onVisibilityChange?.(visible);
  });
}

export function toggleSubtitleVisibility(): void {
  visible = !visible;
  devDiag("subtitle", "toggle", { visible });
  suppressScrollSpy(400, "subtitle-toggle");
  if (subtitlesEnabledRef) {
    subtitlesEnabledRef.current = visible;
  }
  commitVisibilityUi();
}

export function setSubtitleVisibility(next: boolean): void {
  if (visible === next) {
    return;
  }
  visible = next;
  if (subtitlesEnabledRef) {
    subtitlesEnabledRef.current = visible;
  }
  commitVisibilityUi();
}
