/** Parte texto en palabras para sincronización proporcional con el audio. */
export function splitWords(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  return trimmed.split(/\s+/).filter(Boolean);
}

export function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
