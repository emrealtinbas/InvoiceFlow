import { Loader2 } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';

/** Accessible route-level loading state used while feature pages are fetched. */
export function LoadingState() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Loading page…</span>
      <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-hidden="true">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </div>
      <div className="space-y-3" aria-hidden="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <Skeleton className="h-4 w-3/4 max-w-lg" />
      </div>
      <div className="grid gap-4 md:grid-cols-2" aria-hidden="true">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  );
}
