import { memo } from "react";
import { X } from "lucide-react";
interface DocumentHeaderLoadBarProps {
  loading: boolean;
  message?: string;
  error: string | null;
  onDismissError?: () => void;
}

export const DocumentHeaderLoadBar = memo(function DocumentHeaderLoadBar({
  loading,
  message,
  error,
  onDismissError,
}: DocumentHeaderLoadBarProps) {
  if (loading) {
    return (
      <div
        className="absolute inset-x-0 bottom-0 z-10"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        {message ? (
          <p
            className="truncate px-4 pb-1 text-center text-[10px] text-muted-foreground"
            title={message}
          >
            {message}
          </p>
        ) : null}
        <div className="relative h-0.5 w-full overflow-hidden bg-primary/15">
          <div
            className="absolute inset-y-0 w-1/3 rounded-full bg-primary/90 animate-[header-load-slide_1.1s_ease-in-out_infinite]"
          />
        </div>
      </div>
    );
  }

  if (!error) {
    return null;
  }

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 border-t border-destructive/25 bg-destructive/10 px-3 py-1.5"
      role="alert"
    >
      <p className="min-w-0 flex-1 truncate text-xs text-destructive" title={error}>
        {error}
      </p>
      {onDismissError ? (
        <button
          type="button"
          className="tauri-interactive-zone shrink-0 rounded p-0.5 text-destructive/80 transition-colors hover:bg-destructive/15 hover:text-destructive"
          aria-label="Cerrar mensaje de error"
          onClick={onDismissError}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
});
