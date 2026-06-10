import type { AppLanguage } from "@/types";

export const LANGUAGE_OPTIONS: {
  id: AppLanguage;
  label: string;
  short: string;
}[] = [
  { id: "es", label: "Español", short: "ES" },
  { id: "en", label: "Inglés", short: "EN" },
];

export function languageLabel(id: AppLanguage): string {
  return LANGUAGE_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

export function oppositeLanguage(lang: AppLanguage): AppLanguage {
  return lang === "es" ? "en" : "es";
}
