import type { AppLanguage } from "@/types";

export interface VoiceOption {
  id: string;
  modelStem: string;
  language: AppLanguage;
  name: string;
  region: string;
  previewText: string;
}

export const VOICE_CATALOG: VoiceOption[] = [
  {
    id: "es-ar-daniela",
    modelStem: "es_AR-daniela-high",
    language: "es",
    name: "Daniela",
    region: "Argentina",
    previewText:
      "Hola, soy Daniela. Así suena mi voz leyendo un documento en español.",
  },
  {
    id: "es-es-sharvard",
    modelStem: "es_ES-sharvard-medium",
    language: "es",
    name: "Sharvard",
    region: "España",
    previewText:
      "Hola, esta es la voz Sharvard para lectura en español peninsular.",
  },
  {
    id: "en-us-lessac",
    modelStem: "en_US-lessac-medium",
    language: "en",
    name: "Lessac",
    region: "Estados Unidos",
    previewText:
      "Hello, I'm Lessac. This is how I sound reading an English document.",
  },
  {
    id: "en-us-amy",
    modelStem: "en_US-amy-medium",
    language: "en",
    name: "Amy",
    region: "Estados Unidos",
    previewText:
      "Hello, I'm Amy. This is a short preview of my American English voice.",
  },
  {
    id: "en-us-ryan",
    modelStem: "en_US-ryan-medium",
    language: "en",
    name: "Ryan",
    region: "Estados Unidos",
    previewText:
      "Hello, I'm Ryan. Here's a quick sample of my United States voice.",
  },
];

export const DEFAULT_VOICE_IDS: Record<AppLanguage, string> = {
  es: "es-es-sharvard",
  en: "en-us-lessac",
};

export function defaultVoiceForLanguage(language: AppLanguage): VoiceOption {
  const fallbackId = DEFAULT_VOICE_IDS[language];
  return VOICE_CATALOG.find((v) => v.id === fallbackId) ?? VOICE_CATALOG[0];
}
