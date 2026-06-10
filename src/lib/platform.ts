export function isTauriMac(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const inTauri = "__TAURI_INTERNALS__" in window;
  const isMac =
    navigator.platform.toLowerCase().includes("mac") ||
    navigator.userAgent.includes("Mac");
  return inTauri && isMac;
}
