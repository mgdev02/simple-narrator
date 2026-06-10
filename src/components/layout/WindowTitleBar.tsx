import { useEffect, useState } from "react";
import { APP_NAME, APP_VERSION } from "@/lib/app";
import { isTauriMac } from "@/lib/platform";

/**
 * Barra superior en macOS (titleBarStyle Overlay): título centrado y arrastre de ventana.
 */
export function WindowTitleBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(isTauriMac());
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      data-tauri-drag-region
      className="mac-window-titlebar relative shrink-0 border-b border-border/30 bg-background/80 backdrop-blur-md"
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-center gap-1.5 text-center text-xs font-medium tracking-wide text-muted-foreground"
      >
        {APP_NAME}
        <span className="text-muted-foreground/45" aria-hidden="true">·</span>
        <span className="text-[10px] font-normal text-muted-foreground/65">
          {APP_VERSION}
        </span>
      </span>
    </div>
  );
}
