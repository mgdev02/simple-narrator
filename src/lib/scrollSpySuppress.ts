import { devDiag } from "@/lib/devDiag";

let suppressedUntil = 0;

/** Evita que el scroll spy cambie de página tras cambios de layout (ajuste, prep). */
export function suppressScrollSpy(ms = 600, reason?: string): void {
  const nextUntil = Date.now() + ms;
  if (nextUntil > suppressedUntil) {
    suppressedUntil = nextUntil;
    devDiag("scroll-spy", "suppressed", { ms, reason, until: suppressedUntil });
  }
}

export function isScrollSpySuppressed(): boolean {
  return Date.now() < suppressedUntil;
}

/** Bloquea scroll spy hasta que el usuario hace scroll manual (wheel/touch). */
let blockUntilUserScroll = false;

export function blockScrollSpyUntilUserScroll(reason?: string): void {
  blockUntilUserScroll = true;
  suppressScrollSpy(5000, reason ?? "await-user-scroll");
  devDiag("scroll-spy", "block-until-user-scroll", { reason });
}

export function notifyUserScroll(): void {
  if (blockUntilUserScroll) {
    blockUntilUserScroll = false;
    devDiag("scroll-spy", "user-scroll-unblock");
  }
}

export function isScrollSpyBlockedForLayout(): boolean {
  return blockUntilUserScroll;
}
