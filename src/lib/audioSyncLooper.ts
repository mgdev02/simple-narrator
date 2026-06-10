import type { AudioTickHandler } from "@/lib/narrationSync";

/**
 * Loop de sincronización con requestAnimationFrame (~60 Hz).
 * Evita depender solo de `timeupdate` del <audio> (~4 Hz) y no pasa por React ni IPC Tauri.
 */
export class AudioSyncLooper {
  private audio: HTMLAudioElement | null = null;
  private handler: AudioTickHandler | null = null;
  private rafId: number | null = null;
  private running = false;

  attach(audio: HTMLAudioElement | null, handler: AudioTickHandler | null): void {
    this.stop();
    this.audio = audio;
    this.handler = handler;

    if (audio && handler) {
      this.emit();
      if (!audio.paused && !audio.ended) {
        this.start();
      }
    }
  }

  start(): void {
    if (this.running || !this.audio || !this.handler) {
      return;
    }
    this.running = true;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  emit(): void {
    if (!this.handler || !this.audio) {
      return;
    }
    this.handler({
      currentTime: this.audio.currentTime,
      duration: this.audio.duration,
    });
  }

  private schedule(): void {
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (!this.running || !this.audio || !this.handler) {
        return;
      }

      this.emit();

      if (!this.audio.paused && !this.audio.ended) {
        this.schedule();
      } else {
        this.running = false;
      }
    });
  }
}
