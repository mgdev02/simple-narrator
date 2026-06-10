import { memo } from "react";
import { usePagePrepSnapshot } from "@/hooks/usePagePrepSnapshot";
import {
  isPagePrepActive,
  pagePrepPercent,
  shouldShowPrepIndicator,
} from "@/lib/pagePrepProgress";
import type { PlayerStatus } from "@/types";
import { PrepProgressBar } from "./PrepProgressBar";

interface PrepProgressIndicatorProps {
  status: PlayerStatus;
  isPdfLoading?: boolean;
}

/** Aislado: solo este componente re-renderiza con el progreso de prep. */
export const PrepProgressIndicator = memo(function PrepProgressIndicator({
  status,
  isPdfLoading = false,
}: PrepProgressIndicatorProps) {
  const pagePrep = usePagePrepSnapshot();

  if (!shouldShowPrepIndicator(pagePrep, status, isPdfLoading)) {
    return null;
  }

  return (
    <PrepProgressBar
      percent={pagePrepPercent(pagePrep, isPdfLoading)}
      active={isPagePrepActive(pagePrep, isPdfLoading)}
      size={16}
      variant="overlay"
      className="shrink-0 gap-1"
    />
  );
});
