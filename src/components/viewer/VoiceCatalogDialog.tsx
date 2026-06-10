import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Check,
  Download,
  Loader2,
  Play,
  Speech,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { languageLabel } from "@/lib/languages";
import {
  downloadVoice,
  listVoiceStates,
  previewVoice,
  type VoiceDownloadProgress,
  type VoiceInstallState,
} from "@/lib/tauri";
import {
  getSelectedVoiceId,
  setSelectedVoiceId,
  voiceForLanguage,
} from "@/lib/voicePreferenceStore";
import { VOICE_CATALOG, type VoiceOption } from "@/lib/voices";
import { cn } from "@/lib/utils";
import type { AppLanguage } from "@/types";

interface VoiceCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVoicePreferenceChange?: () => void;
}

function groupByLanguage(
  voices: VoiceOption[],
): Record<AppLanguage, VoiceOption[]> {
  return {
    es: voices.filter((voice) => voice.language === "es"),
    en: voices.filter((voice) => voice.language === "en"),
  };
}

export function VoiceCatalogDialog({
  open,
  onOpenChange,
  onVoicePreferenceChange,
}: VoiceCatalogDialogProps) {
  const [states, setStates] = useState<VoiceInstallState[]>([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<
    Record<string, number>
  >({});
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const grouped = useMemo(() => groupByLanguage(VOICE_CATALOG), []);

  const refreshStates = useCallback(async () => {
    setLoadingStates(true);
    try {
      const next = await listVoiceStates();
      setStates(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo leer el estado de las voces.",
      );
    } finally {
      setLoadingStates(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    void refreshStates();
  }, [open, refreshStates]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let unlisten: (() => void) | undefined;

    void listen<VoiceDownloadProgress>(
      "voice-download-progress",
      (event) => {
        const { modelStem, percent } = event.payload;
        setDownloadProgress((prev) => ({ ...prev, [modelStem]: percent }));
      },
    ).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [open]);

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
    };
  }, []);

  const stateFor = (modelStem: string): VoiceInstallState | undefined =>
    states.find((state) => state.modelStem === modelStem);

  const handleDownload = async (voice: VoiceOption) => {
    setError(null);
    setDownloading((prev) => ({ ...prev, [voice.modelStem]: true }));
    setDownloadProgress((prev) => ({ ...prev, [voice.modelStem]: 0 }));

    try {
      await downloadVoice(voice.modelStem);
      await refreshStates();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo descargar la voz.",
      );
    } finally {
      setDownloading((prev) => ({ ...prev, [voice.modelStem]: false }));
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[voice.modelStem];
        return next;
      });
    }
  };

  const handleSelect = (voice: VoiceOption) => {
    const state = stateFor(voice.modelStem);
    if (!state?.installed || !state.patched) {
      return;
    }

    setSelectedVoiceId(voice.language, voice.id);
    onVoicePreferenceChange?.();
  };

  const handlePreview = async (voice: VoiceOption) => {
    const state = stateFor(voice.modelStem);
    if (!state?.installed) {
      return;
    }

    setError(null);
    setPreviewing(voice.modelStem);
    previewAudioRef.current?.pause();

    try {
      const wavPath = await previewVoice(voice.modelStem, voice.previewText);
      const audio = new Audio(convertFileSrc(wavPath));
      previewAudioRef.current = audio;
      audio.onended = () => setPreviewing(null);
      audio.onerror = () => setPreviewing(null);
      await audio.play();
    } catch (err) {
      setPreviewing(null);
      setError(
        err instanceof Error ? err.message : "No se pudo reproducir la muestra.",
      );
    }
  };

  const renderVoiceRow = (voice: VoiceOption) => {
    const state = stateFor(voice.modelStem);
    const isInstalled = state?.installed ?? false;
    const isPatched = state?.patched ?? false;
    const isSelected = getSelectedVoiceId(voice.language) === voice.id;
    const isDownloading = downloading[voice.modelStem] ?? false;
    const progress = downloadProgress[voice.modelStem];

    return (
      <li
        key={voice.id}
        className={cn(
          "rounded-lg border border-border/50 bg-muted/15 p-3",
          isSelected && "border-primary/50 bg-primary/5",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {voice.name}
              <span className="text-muted-foreground"> · {voice.region}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {voice.modelStem}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              {isInstalled
                ? isPatched
                  ? "Lista para narrar con sincronización"
                  : "Instalada · requiere parche (ejecuta setup-local-ai.sh)"
                : "No instalada"}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-2"
              disabled={!isInstalled || previewing === voice.modelStem}
              aria-label={`Preescuchar ${voice.name}`}
              onClick={() => void handlePreview(voice)}
            >
              {previewing === voice.modelStem ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
            </Button>

            {isInstalled && isPatched ? (
              <Button
                type="button"
                size="sm"
                variant={isSelected ? "default" : "outline"}
                className="h-8 gap-1 px-2.5 text-xs"
                onClick={() => handleSelect(voice)}
              >
                {isSelected ? (
                  <Check className="size-3.5" />
                ) : null}
                {isSelected ? "Activa" : "Usar"}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1 px-2.5 text-xs"
                disabled={isDownloading}
                onClick={() => void handleDownload(voice)}
              >
                {isDownloading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                Descargar
              </Button>
            )}
          </div>
        </div>

        {isDownloading && typeof progress === "number" ? (
          <Progress value={progress} className="mt-2 h-1" />
        ) : null}
      </li>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Speech className="size-5 text-primary" />
            Voces Piper
          </DialogTitle>
          <DialogDescription>
            Descarga voces desde Hugging Face y elige la activa para cada idioma.
            La voz activa en español es{" "}
            <strong>{voiceForLanguage("es").name}</strong> y en inglés{" "}
            <strong>{voiceForLanguage("en").name}</strong>.
          </DialogDescription>
        </DialogHeader>

        {loadingStates ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Leyendo voces instaladas…
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}

        <div className="space-y-4">
          {(["es", "en"] as AppLanguage[]).map((lang) => (
            <section key={lang}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {languageLabel(lang)}
              </h3>
              <ul className="space-y-2">{grouped[lang].map(renderVoiceRow)}</ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
