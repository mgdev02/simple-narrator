import { useSyncExternalStore } from "react";
import {
  getSubtitlePanelWidthSnapshot,
  getSubtitleVisibilitySnapshot,
  setSubtitleVisibility,
  subscribeSubtitlePanelWidth,
  subscribeSubtitleVisibility,
  toggleSubtitleVisibility,
} from "@/lib/subtitleVisibilityStore";

const SUBTITLE_WIDTH_DEFAULT = 224;

/** Solo visibilidad — evita re-render al cambiar ancho del panel (media queries). */
export function useSubtitleVisible(): boolean {
  return useSyncExternalStore(
    subscribeSubtitleVisibility,
    getSubtitleVisibilitySnapshot,
    () => false,
  );
}

/** Solo ancho del panel — para layout del visor. */
export function useSubtitlePanelWidth(): number {
  return useSyncExternalStore(
    subscribeSubtitlePanelWidth,
    getSubtitlePanelWidthSnapshot,
    () => SUBTITLE_WIDTH_DEFAULT,
  );
}

export function useSubtitleVisibility() {
  const visible = useSubtitleVisible();
  const panelWidthPx = useSubtitlePanelWidth();

  return {
    visible,
    panelWidthPx,
    toggle: toggleSubtitleVisibility,
    setVisible: setSubtitleVisibility,
  };
}
