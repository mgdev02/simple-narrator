use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceCatalogEntry {
    pub id: String,
    pub model_stem: String,
    pub language: String,
    pub name: String,
    pub region: String,
    pub preview_text: String,
    pub hf_path: String,
}

pub fn voice_catalog() -> Result<Vec<VoiceCatalogEntry>, String> {
    let raw = include_str!("../../voice-catalog.json");
    serde_json::from_str(raw).map_err(|e| format!("Catálogo de voces inválido: {e}"))
}

pub fn catalog_entry_for_stem(model_stem: &str) -> Result<VoiceCatalogEntry, String> {
    let stem = model_stem.trim();
    voice_catalog()?
        .into_iter()
        .find(|entry| entry.model_stem == stem)
        .ok_or_else(|| format!("Voz no disponible en el catálogo: {stem}"))
}
