import { useEffect, useState } from "react";
import { setSubtitlePanelWidth } from "@/lib/subtitleVisibilityStore";

/** Coincide con w-56 / sm:w-60 / lg:w-64 del panel de subtítulos. */
const SUBTITLE_WIDTH_SM = 240;
const SUBTITLE_WIDTH_LG = 256;
const SUBTITLE_WIDTH_DEFAULT = 224;

export function useSubtitlePanelWidth(): number {
  const [width, setWidth] = useState(SUBTITLE_WIDTH_DEFAULT);

  useEffect(() => {
    const mqSm = window.matchMedia("(min-width: 640px)");
    const mqLg = window.matchMedia("(min-width: 1024px)");

    const sync = () => {
      const next = mqLg.matches
        ? SUBTITLE_WIDTH_LG
        : mqSm.matches
          ? SUBTITLE_WIDTH_SM
          : SUBTITLE_WIDTH_DEFAULT;
      setWidth(next);
      setSubtitlePanelWidth(next);
    };

    sync();
    mqSm.addEventListener("change", sync);
    mqLg.addEventListener("change", sync);
    return () => {
      mqSm.removeEventListener("change", sync);
      mqLg.removeEventListener("change", sync);
    };
  }, []);

  return width;
}
