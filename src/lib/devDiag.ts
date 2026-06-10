import { invoke } from "@tauri-apps/api/core";

const ENABLED = import.meta.env.DEV;

/** Log a consola del webview y a la terminal de `tauri dev` vía Rust. */
export function devDiag(
  tag: string,
  message: string,
  detail?: Record<string, unknown>,
): void {
  if (!ENABLED) {
    return;
  }

  const line =
    detail && Object.keys(detail).length > 0
      ? `${message} | ${JSON.stringify(detail)}`
      : message;

  console.log(`[Narrator:${tag}]`, line);

  void invoke("dev_log", { tag, message: line }).catch(() => {
    // Vite sin Tauri: solo consola del browser.
  });
}
