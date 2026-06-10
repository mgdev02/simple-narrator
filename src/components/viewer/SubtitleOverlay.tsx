import { SubtitlePanel } from "@/components/viewer/SubtitlePanel";
import {
  useSubtitlePanelWidth,
  useSubtitleVisible,
} from "@/contexts/SubtitleVisibilityContext";
import { oppositeLanguage } from "@/lib/languages";
import type { NarrationSyncController } from "@/lib/narrationSync";
import type { AppLanguage } from "@/types";

interface SubtitleOverlayProps {
  hasDocument: boolean;
  listenLanguage: AppLanguage;
  syncController: NarrationSyncController;
}

/** Panel de subtítulos superpuesto; solo este componente re-renderiza al togglear. */
export function SubtitleOverlay({
  hasDocument,
  listenLanguage,
  syncController,
}: SubtitleOverlayProps) {
  const visible = useSubtitleVisible();
  const panelWidthPx = useSubtitlePanelWidth();

  if (!hasDocument) {
    return null;
  }

  return (
    <SubtitlePanel
      language={oppositeLanguage(listenLanguage)}
      syncController={syncController}
      visible={visible}
      widthPx={panelWidthPx}
    />
  );
}
