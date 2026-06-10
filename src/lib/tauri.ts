import { invoke } from "@tauri-apps/api/core";
import type {
  AppLanguage,
  GenerateAudioResult,
  PdfMetadataResult,
  PdfPageTextResult,
  PreparePageTextResult,
} from "@/types";

export async function pickPdfFile(): Promise<string | null> {
  return invoke<string | null>("pick_pdf_file");
}

export async function openPdf(path: string): Promise<PdfMetadataResult> {
  return invoke<PdfMetadataResult>("open_pdf", { path });
}

export async function preloadPdf(path: string): Promise<number> {
  return invoke<number>("preload_pdf", { path });
}

export async function preparePageText(
  path: string,
  displayPage: number,
  listenLanguage: AppLanguage,
): Promise<PreparePageTextResult> {
  return invoke<PreparePageTextResult>("prepare_page_text", {
    path,
    displayPage,
    listenLanguage,
  });
}

export async function extractPdfPage(
  path: string,
  displayPage: number,
): Promise<PdfPageTextResult> {
  return invoke<PdfPageTextResult>("extract_pdf_page", {
    path,
    displayPage,
  });
}

export async function closePdf(path: string): Promise<void> {
  return invoke<void>("close_pdf", { path });
}

export async function detectLanguage(text: string): Promise<AppLanguage | null> {
  const code = await invoke<string | null>("detect_language", { text });
  if (code === "es" || code === "en") {
    return code;
  }
  return null;
}

export async function translateText(
  text: string,
  fromLanguage: AppLanguage,
  toLanguage: AppLanguage,
): Promise<string> {
  return invoke<string>("translate_text_command", {
    text,
    fromLanguage,
    toLanguage,
  });
}

export async function generateAudio(
  text: string,
  outputPath: string,
  language: AppLanguage,
  modelStem?: string,
  sourceText?: string | null,
): Promise<GenerateAudioResult> {
  return invoke<GenerateAudioResult>("generate_audio", {
    text,
    outputPath,
    language,
    modelStem: modelStem ?? null,
    sourceText: sourceText ?? null,
  });
}

export async function previewVoice(
  modelStem: string,
  text: string,
): Promise<string> {
  return invoke<string>("preview_voice", { modelStem, text });
}

export interface VoiceInstallState {
  modelStem: string;
  installed: boolean;
  patched: boolean;
}

export interface VoiceDownloadProgress {
  modelStem: string;
  phase: string;
  percent: number;
}

export async function listVoiceStates(): Promise<VoiceInstallState[]> {
  return invoke<VoiceInstallState[]>("list_voice_states_command");
}

export async function downloadVoice(modelStem: string): Promise<void> {
  return invoke<void>("download_voice_command", { modelStem });
}
