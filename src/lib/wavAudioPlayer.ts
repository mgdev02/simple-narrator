import { convertFileSrc } from "@tauri-apps/api/core";
import { AudioSyncLooper } from "@/lib/audioSyncLooper";
import type { AudioTickState } from "@/lib/narrationSync";

const LOAD_TIMEOUT_MS = 45_000;

export class WavAudioPlayer {
  private audio: HTMLAudioElement | null = null;
  /** Pausa solicitada por el usuario — persiste entre chunks hasta resume/stop. */
  private pauseRequested = false;
  private tickHandler: ((state: AudioTickState) => void) | null = null;
  private pendingStart: (() => void) | null = null;
  private readonly syncLooper = new AudioSyncLooper();

  stop(): void {
    this.setTickHandler(null);
    this.pauseRequested = false;
    this.pendingStart = null;
    this.disposeAudio();
  }

  private disposeAudio(): void {
    this.syncLooper.stop();
    const audio = this.audio;
    if (!audio) {
      return;
    }
    audio.onended = null;
    audio.onerror = null;
    audio.oncanplaythrough = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    this.audio = null;
    this.pendingStart = null;
  }

  pause(): void {
    this.pauseRequested = true;
    this.syncLooper.stop();
    this.audio?.pause();
  }

  /** Sincroniza pausa del hook antes de cargar un fragmento nuevo. */
  setPauseRequested(paused: boolean): void {
    this.pauseRequested = paused;
    if (paused) {
      this.syncLooper.stop();
      this.audio?.pause();
    }
  }

  isPauseRequested(): boolean {
    return this.pauseRequested;
  }

  async resume(): Promise<void> {
    this.pauseRequested = false;

    if (!this.audio) {
      return;
    }

    if (this.pendingStart) {
      const start = this.pendingStart;
      this.pendingStart = null;
      try {
        await start();
        this.syncLooper.emit();
        this.syncLooper.start();
      } catch {
        // El error se propagará vía la promesa de play().
      }
      return;
    }

    if (this.audio.paused) {
      await this.audio.play();
      this.syncLooper.emit();
      this.syncLooper.start();
    }
  }

  getElement(): HTMLAudioElement | null {
    return this.audio;
  }

  setTickHandler(handler: ((state: AudioTickState) => void) | null): void {
    this.tickHandler = handler;
    this.bindSyncLooper();
    if (handler && this.audio) {
      this.syncLooper.emit();
    }
  }

  private bindSyncLooper(): void {
    this.syncLooper.attach(this.audio, this.tickHandler);
  }

  async play(filePath: string, attempt = 1): Promise<void> {
    this.disposeAudio();

    const url = convertFileSrc(filePath);
    const audio = new Audio();
    this.audio = audio;
    this.bindSyncLooper();

    try {
      await this.waitAndPlay(audio, url, filePath);
    } catch (err) {
      this.disposeAudio();
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 200));
        return this.play(filePath, attempt + 1);
      }
      throw err;
    }
  }

  private waitAndPlay(
    audio: HTMLAudioElement,
    url: string,
    filePath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let started = false;

      const finish = (fn: () => void) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        this.pendingStart = null;
        this.syncLooper.stop();
        audio.onended = null;
        audio.onerror = null;
        audio.oncanplaythrough = null;
        fn();
      };

      const timeoutId = setTimeout(() => {
        finish(() =>
          reject(
            new Error(
              `Tiempo de espera agotado al cargar audio (${filePath})`,
            ),
          ),
        );
      }, LOAD_TIMEOUT_MS);

      audio.onended = () => finish(() => resolve());

      audio.onerror = () => {
        const code = audio.error?.code;
        const mediaMessage = audio.error?.message;
        finish(() =>
          reject(
            new Error(
              `No se pudo reproducir el audio (código ${code ?? "?"}${mediaMessage ? `: ${mediaMessage}` : ""})`,
            ),
          ),
        );
      };

      const tryStart = () => {
        if (started || settled) {
          return;
        }
        if (this.pauseRequested) {
          this.pendingStart = () =>
            audio.play().then(() => {
              started = true;
            });
          return;
        }

        started = true;
        this.pendingStart = null;
        audio
          .play()
          .then(() => {
            this.syncLooper.emit();
            this.syncLooper.start();
          })
          .catch((playErr) =>
            finish(() =>
              reject(
                playErr instanceof Error
                  ? playErr
                  : new Error("No se pudo iniciar la reproducción"),
              ),
            ),
          );
      };

      audio.oncanplaythrough = tryStart;
      audio.preload = "auto";
      audio.src = url;
      audio.load();

      if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        tryStart();
      }
    });
  }
}
