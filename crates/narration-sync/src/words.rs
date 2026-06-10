pub fn split_words(text: &str) -> Vec<String> {
    text.split_whitespace()
        .filter(|w| !w.is_empty())
        .map(|w| w.to_string())
        .collect()
}
