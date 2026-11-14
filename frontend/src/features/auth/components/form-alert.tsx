import type { ReactNode } from 'react';

import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

type AlertTone = 'error' | 'success' | 'info';

interface FormAlertProps {
  tone?: AlertTone;
  children: ReactNode;
  correlationId?: string | undefined;
}

const toneClasses: Record<AlertTone, string> = {
  error: 'border-destructive/25 bg-destructive/5 text-destructive',
  success: 'border-emerald-600/25 bg-emerald-50 text-emerald-800',
  info: 'border-border bg-muted/40 text-foreground',
};

/** Inline, accessible feedback. Never renders server stack traces or exception messages. */
export function FormAlert({ tone = 'error', children, correlationId }: FormAlertProps) {
  const Icon = tone === 'error' ? AlertCircle : tone === 'success' ? CheckCircle2 : Info;

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm',
        toneClasses[tone],
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        <div className="leading-5">{children}</div>
        {correlationId ? (
          <p className="font-mono text-[11px] leading-4 opacity-75">Reference: {correlationId}</p>
        ) : null}
      </div>
    </div>
  );
}
