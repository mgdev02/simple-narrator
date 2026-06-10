import type { AppLanguage } from "@/types";
import {
  DEFAULT_VOICE_IDS,
  defaultVoiceForLanguage,
  voiceById,
  type VoiceOption,
} from "@/lib/voices";

const STORAGE_KEY = "simple-narrator-voice-prefs";

type VoicePrefs = Partial<Record<AppLanguage, string>>;

function readPrefs(): VoicePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as VoicePrefs;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writePrefs(prefs: VoicePrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function getSelectedVoiceId(language: AppLanguage): string {
  const prefs = readPrefs();
  return prefs[language] ?? DEFAULT_VOICE_IDS[language];
}

export function setSelectedVoiceId(language: AppLanguage, voiceId: string): void {
  const prefs = readPrefs();
  prefs[language] = voiceId;
  writePrefs(prefs);
}

export function voiceForLanguage(language: AppLanguage): VoiceOption {
  const id = getSelectedVoiceId(language);
  return voiceById(id) ?? defaultVoiceForLanguage(language);
}
