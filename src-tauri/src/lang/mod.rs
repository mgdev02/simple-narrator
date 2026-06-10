use whatlang::{Lang, detect};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppLanguage {
    Es,
    En,
}

impl AppLanguage {
    pub fn code(self) -> &'static str {
        match self {
            AppLanguage::Es => "es",
            AppLanguage::En => "en",
        }
    }

    pub fn from_code(code: &str) -> Option<Self> {
        match code.trim().to_lowercase().as_str() {
            "es" | "spa" | "spanish" => Some(AppLanguage::Es),
            "en" | "eng" | "english" => Some(AppLanguage::En),
            _ => None,
        }
    }
}

pub fn detect_language(text: &str) -> Option<AppLanguage> {
    let sample = text.chars().take(4000).collect::<String>();
    if sample.trim().len() < 12 {
        return None;
    }

    let info = detect(&sample)?;

    if info.confidence() < 0.55 {
        return None;
    }

    match info.lang() {
        Lang::Eng => Some(AppLanguage::En),
        Lang::Spa => Some(AppLanguage::Es),
        _ => None,
    }
}
