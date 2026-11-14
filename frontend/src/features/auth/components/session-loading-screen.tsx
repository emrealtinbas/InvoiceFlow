import { Loader2 } from 'lucide-react';

/** Full-page check shown only while a protected route waits for verified identity. */
export function SessionLoadingScreen() {
  return (
    <div
      className="grid min-h-dvh place-items-center bg-muted/30 px-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">Checking your session…</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Protected content is not shown until your identity is verified.
          </p>
        </div>
      </div>
    </div>
  );
}
