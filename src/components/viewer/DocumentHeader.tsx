import { memo } from "react";
import { Trash2 } from "lucide-react";
import { PdfMark } from "@/components/branding/PdfMark";
import { LANGUAGE_OPTIONS, oppositeLanguage } from "@/lib/languages";
import type { AppLanguage, OpenDocument, PlayerStatus } from "@/types";
import { DocumentHeaderCenter } from "./DocumentHeaderCenter";
import { DocumentHeaderLoadBar } from "./DocumentHeaderLoadBar";
import { DocumentHeaderSubtitleToggle } from "./DocumentHeaderSubtitleToggle";
import { DocumentPageCounter } from "./DocumentPageCounter";
import { VoiceCatalogButton } from "./VoiceCatalogButton";

interface DocumentHeaderProps {
  document: OpenDocument | null;
  status: PlayerStatus;
  currentPage: number;
  listenLanguage: AppLanguage;
  canPlay: boolean;
  canPause: boolean;
  isPdfLoading?: boolean;
  pdfLoadingMessage?: string;
  pdfLoadError?: string | null;
  onDismissPdfLoadError?: () => void;
  onCloseDocument: () => void;
  onListenLanguageChange: (language: AppLanguage) => void;
  onPlay: () => void;
  onPause: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onOpenVoiceCatalog?: () => void;
}

export const DocumentHeader = memo(function DocumentHeader({
  document,
  status,
  currentPage,
  listenLanguage,
  canPlay,
  canPause,
  isPdfLoading = false,
  pdfLoadingMessage,
  pdfLoadError = null,
  onDismissPdfLoadError,
  onCloseDocument,
  onListenLanguageChange,
  onPlay,
  onPause,
  onPrevPage,
  onNextPage,
  onOpenVoiceCatalog,
}: DocumentHeaderProps) {
  const isBusy =
    status === "opening" || status === "preparing" || status === "playing";
  const subtitleLang = oppositeLanguage(listenLanguage);

  return (
    <header className="relative z-30 shrink-0 border-b border-border/40 bg-card/80 backdrop-blur-xl">
      <div
        className="grid grid-cols-1 items-center gap-3 px-4 py-2.5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
      >
        <div
          data-tauri-drag-region
          className="tauri-drag-region flex min-w-0 items-center gap-3"
        >
          <PdfMark className="self-center" />
          <div className="min-w-0 py-0.5">
            <div className="flex min-w-0 items-center gap-1.5 leading-snug">
              <p className="min-w-0 truncate text-sm font-semibold tracking-tight">
                {document
                  ? document.name.replace(/\.pdf$/i, "")
                  : "Simple Narrator"}
              </p>
              {document ? (
                <button
                  type="button"
                  className="tauri-interactive-zone inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                  aria-label="Cerrar documento y volver al inicio"
                  onClick={onCloseDocument}
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
            <p className="truncate text-xs leading-snug text-muted-foreground">
              {document ? (
                <DocumentPageCounter
                  currentPage={currentPage}
                  pageCount={document.pageCount}
                />
              ) : (
                "PDF a audio · Piper local"
              )}
            </p>
          </div>
        </div>

        {document ? (
          <DocumentHeaderCenter
            currentPage={currentPage}
            pageCount={document.pageCount}
            status={status}
            canPlay={canPlay}
            canPause={canPause}
            onPlay={onPlay}
            onPause={onPause}
            onPrevPage={onPrevPage}
            onNextPage={onNextPage}
            isPdfLoading={isPdfLoading}
          />
        ) : (
          <div className="hidden lg:block" aria-hidden="true" />
        )}

        {document ? (
          <div className="tauri-interactive-zone flex flex-wrap items-center gap-2 lg:justify-end">
            <div className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-2.5">
              <label
                htmlFor="audio-language"
                className="shrink-0 text-xs text-muted-foreground"
              >
                Idioma del audio
              </label>
              <select
                id="audio-language"
                value={listenLanguage}
                disabled={isBusy}
                onChange={(e) =>
                  onListenLanguageChange(e.target.value as AppLanguage)
                }
                className="h-7 max-w-[11rem] min-w-0 cursor-pointer rounded-md border-0 bg-transparent pr-1 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Idioma del audio"
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <DocumentHeaderSubtitleToggle subtitleLang={subtitleLang} />

            {onOpenVoiceCatalog ? (
              <VoiceCatalogButton onOpen={onOpenVoiceCatalog} />
            ) : null}
          </div>
        ) : (
          <div className="hidden lg:block" aria-hidden="true" />
        )}
      </div>

      <DocumentHeaderLoadBar
        loading={isPdfLoading}
        message={pdfLoadingMessage}
        error={pdfLoadError}
        onDismissError={onDismissPdfLoadError}
      />
    </header>
  );
});
