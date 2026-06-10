import type { AppLanguage } from "@/types";
import catalog from "../../src-tauri/voice-catalog.json";

export interface VoiceOption {
  id: string;
  modelStem: string;
  language: AppLanguage;
  name: string;
  region: string;
  previewText: string;
  hfPath: string;
}

export const VOICE_CATALOG: VoiceOption[] = catalog as VoiceOption[];

export const DEFAULT_VOICE_IDS: Record<AppLanguage, string> = {
  es: "es-es-sharvard",
  en: "en-us-lessac",
};

export function voiceById(id: string): VoiceOption | undefined {
  return VOICE_CATALOG.find((voice) => voice.id === id);
}

export function defaultVoiceForLanguage(language: AppLanguage): VoiceOption {
  const fallbackId = DEFAULT_VOICE_IDS[language];
  return voiceById(fallbackId) ?? VOICE_CATALOG[0];
}
