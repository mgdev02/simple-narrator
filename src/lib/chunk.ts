const DEFAULT_MAX_CHUNK_CHARS = 1000;

function charLen(text: string): number {
  return [...text].length;
}

function hardSplit(text: string, maxChars: number): string[] {
  const chars = [...text];
  const chunks: string[] = [];
  for (let start = 0; start < chars.length; start += maxChars) {
    chunks.push(chars.slice(start, start + maxChars).join(""));
  }
  return chunks;
}

function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let current = "";

  for (const ch of text) {
    current += ch;
    if (ch === "." || ch === "!" || ch === "?" || ch === "…") {
      sentences.push(current);
      current = "";
    }
  }

  if (current.trim()) {
    sentences.push(current);
  }

  return sentences.length > 0 ? sentences : [text];
}

function splitLongSegment(segment: string, maxChars: number): string[] {
  const sentences = splitSentences(segment);
  const chunks: string[] = [];
  let buffer = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (charLen(trimmed) > maxChars) {
      if (buffer) {
        chunks.push(buffer.trim());
        buffer = "";
      }
      chunks.push(...hardSplit(trimmed, maxChars));
      continue;
    }

    const combined =
      charLen(buffer) + (buffer ? 1 : 0) + charLen(trimmed);
    if (combined > maxChars && buffer) {
      chunks.push(buffer.trim());
      buffer = "";
    }

    buffer = buffer ? `${buffer} ${trimmed}` : trimmed;
  }

  if (buffer) {
    chunks.push(buffer.trim());
  }

  return chunks;
}

/** Divide texto para síntesis y resaltado sincronizado. */
export function chunkText(
  text: string,
  maxChars = DEFAULT_MAX_CHUNK_CHARS,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (charLen(trimmed) <= maxChars) return [trimmed];

  const paragraphs = trimmed
    .split("\n\n")
    .map((p) => p.trim())
    .filter(Boolean);

  const result: string[] = [];
  let buffer = "";

  for (const paragraph of paragraphs) {
    const pieces =
      charLen(paragraph) <= maxChars
        ? [paragraph]
        : splitLongSegment(paragraph, maxChars);

    for (const piece of pieces) {
      const pieceLen = charLen(piece);
      const bufferLen = charLen(buffer);
      const separator = buffer ? 2 : 0;

      if (bufferLen + separator + pieceLen <= maxChars) {
        buffer = buffer ? `${buffer}\n\n${piece}` : piece;
      } else {
        if (buffer) result.push(buffer.trim());
        buffer = pieceLen <= maxChars ? piece : "";
        if (pieceLen > maxChars) {
          result.push(...hardSplit(piece, maxChars));
        }
      }
    }
  }

  if (buffer) result.push(buffer.trim());
  return result;
}
