import { AlertCircle } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

interface CustomerFormAlertProps {
  message: string;
  correlationId?: string | undefined;
  className?: string;
}

/** Inline mutation error. Server stack traces and raw exception text are never rendered. */
export function CustomerFormAlert({ message, correlationId, className }: CustomerFormAlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm text-destructive',
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <p className="leading-5">{message}</p>
        {correlationId ? (
          <p className="font-mono text-[11px] leading-4 opacity-75">Reference: {correlationId}</p>
        ) : null}
      </div>
    </div>
  );
}
