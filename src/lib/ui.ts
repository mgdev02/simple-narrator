/** Deja que React pinte el modal antes de trabajo pesado en el hilo JS. */
export function waitForUiPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
