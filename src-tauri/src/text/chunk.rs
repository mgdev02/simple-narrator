/// Tamaño máximo recomendado por chunk para Piper (caracteres Unicode).
pub const DEFAULT_MAX_CHUNK_CHARS: usize = 1000;

/// Primer fragmento más corto para que la primera síntesis termine antes.
pub const LEAD_CHUNK_MAX_CHARS: usize = 280;

/// Divide texto largo en chunks respetando párrafos y frases cuando es posible.
pub fn chunk_text(text: &str, max_chars: usize) -> Vec<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    if trimmed.chars().count() <= max_chars {
        return vec![trimmed.to_string()];
    }

    let paragraphs: Vec<&str> = trimmed
        .split("\n\n")
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .collect();

    let mut result = Vec::new();
    let mut buffer = String::new();

    for paragraph in paragraphs {
        let pieces = if char_len(paragraph) <= max_chars {
            vec![paragraph.to_string()]
        } else {
            split_long_segment(paragraph, max_chars)
        };

        for piece in pieces {
            let piece_len = char_len(&piece);
            let buffer_len = char_len(&buffer);
            let separator = if buffer.is_empty() { 0 } else { 2 };

            if buffer_len + separator + piece_len <= max_chars {
                if !buffer.is_empty() {
                    buffer.push_str("\n\n");
                }
                buffer.push_str(&piece);
            } else {
                if !buffer.is_empty() {
                    result.push(buffer.trim().to_string());
                    buffer.clear();
                }

                if piece_len <= max_chars {
                    buffer = piece;
                } else {
                    result.extend(hard_split(&piece, max_chars));
                }
            }
        }
    }

    if !buffer.is_empty() {
        result.push(buffer.trim().to_string());
    }

    result
}

/// Chunks optimizados para reproducción: el primero es corto para arranque rápido.
pub fn chunk_text_for_playback(text: &str) -> Vec<String> {
    optimize_lead_chunk(chunk_text(text, DEFAULT_MAX_CHUNK_CHARS), LEAD_CHUNK_MAX_CHARS)
}

fn optimize_lead_chunk(chunks: Vec<String>, lead_max: usize) -> Vec<String> {
    if chunks.is_empty() {
        return chunks;
    }

    let first = &chunks[0];
    if char_len(first) <= lead_max {
        return chunks;
    }

    let (lead, rest) = split_lead(first, lead_max);
    let mut optimized = Vec::with_capacity(chunks.len() + 1);
    optimized.push(lead);
    if !rest.is_empty() {
        optimized.push(rest);
    }
    optimized.extend(chunks.into_iter().skip(1));
    optimized
}

fn split_lead(text: &str, lead_max: usize) -> (String, String) {
    let trimmed = text.trim();
    if char_len(trimmed) <= lead_max {
        return (trimmed.to_string(), String::new());
    }

    let mut buffer = String::new();
    for sentence in split_sentences(trimmed) {
        let sentence = sentence.trim();
        if sentence.is_empty() {
            continue;
        }

        let next_len =
            char_len(&buffer) + if buffer.is_empty() { 0 } else { 1 } + char_len(sentence);
        if next_len <= lead_max {
            if !buffer.is_empty() {
                buffer.push(' ');
            }
            buffer.push_str(sentence);
        } else if buffer.is_empty() {
            let lead = chars_prefix(sentence, lead_max);
            let rest_raw = sentence.chars().skip(lead.chars().count()).collect::<String>();
            return (lead, rest_raw.trim().to_string());
        } else {
            break;
        }
    }

    if !buffer.is_empty() {
        let lead = buffer.trim().to_string();
        let skip = lead.chars().count();
        let rest = trimmed.chars().skip(skip).collect::<String>().trim().to_string();
        return (lead, rest);
    }

    let lead = chars_prefix(trimmed, lead_max);
    let rest_raw = trimmed.chars().skip(lead.chars().count()).collect::<String>();
    (lead, rest_raw.trim().to_string())
}

fn chars_prefix(text: &str, max_chars: usize) -> String {
    text.chars().take(max_chars).collect()
}

fn split_long_segment(segment: &str, max_chars: usize) -> Vec<String> {
    let sentences = split_sentences(segment);
    let mut chunks = Vec::new();
    let mut buffer = String::new();

    for sentence in sentences {
        let sentence = sentence.trim();
        if sentence.is_empty() {
            continue;
        }

        if char_len(sentence) > max_chars {
            if !buffer.is_empty() {
                chunks.push(buffer.trim().to_string());
                buffer.clear();
            }
            chunks.extend(hard_split(sentence, max_chars));
            continue;
        }

        let combined = char_len(&buffer) + if buffer.is_empty() { 0 } else { 1 } + char_len(sentence);
        if combined > max_chars && !buffer.is_empty() {
            chunks.push(buffer.trim().to_string());
            buffer.clear();
        }

        if !buffer.is_empty() {
            buffer.push(' ');
        }
        buffer.push_str(sentence);
    }

    if !buffer.is_empty() {
        chunks.push(buffer.trim().to_string());
    }

    chunks
}

fn split_sentences(text: &str) -> Vec<String> {
    let mut sentences = Vec::new();
    let mut current = String::new();

    for ch in text.chars() {
        current.push(ch);
        if matches!(ch, '.' | '!' | '?' | '…') {
            sentences.push(current.clone());
            current.clear();
        }
    }

    if !current.trim().is_empty() {
        sentences.push(current);
    }

    if sentences.is_empty() {
        sentences.push(text.to_string());
    }

    sentences
}

fn hard_split(text: &str, max_chars: usize) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut chunks = Vec::new();
    let mut start = 0;

    while start < chars.len() {
        let end = (start + max_chars).min(chars.len());
        chunks.push(chars[start..end].iter().collect());
        start = end;
    }

    chunks
}

fn char_len(text: &str) -> usize {
    text.chars().count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_text_returns_empty() {
        assert!(chunk_text("", 100).is_empty());
    }

    #[test]
    fn short_text_single_chunk() {
        let chunks = chunk_text("Hola mundo.", 100);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], "Hola mundo.");
    }

    #[test]
    fn splits_long_text_into_multiple_chunks() {
        let text = "Primera frase larga. ".repeat(80);
        let chunks = chunk_text(&text, 200);
        assert!(chunks.len() > 1);
        for chunk in &chunks {
            assert!(char_len(chunk) <= 200);
        }
    }

    #[test]
    fn playback_chunks_start_with_short_lead() {
        let text = "Uno. ".repeat(120);
        let chunks = chunk_text_for_playback(&text);
        assert!(chunks.len() > 1);
        assert!(char_len(&chunks[0]) <= LEAD_CHUNK_MAX_CHARS);
    }

    #[test]
    fn preserves_paragraph_boundaries_when_possible() {
        let text = format!("{}\n\n{}", "a".repeat(50), "b".repeat(50));
        let chunks = chunk_text(&text, 120);
        assert!(chunks.len() >= 1);
        assert!(chunks.iter().all(|c| char_len(c) <= 120));
    }
}
