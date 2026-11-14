import { ReceiptText } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

interface AppLogoProps {
  className?: string;
  variant?: 'default' | 'inverted';
}

export function AppLogo({ className, variant = 'default' }: AppLogoProps) {
  const inverted = variant === 'inverted';

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-xl shadow-sm',
          inverted
            ? 'bg-primary-foreground text-primary shadow-none'
            : 'bg-primary text-primary-foreground',
        )}
      >
        <ReceiptText className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block text-sm font-semibold tracking-tight',
            inverted ? 'text-primary-foreground' : 'text-foreground',
          )}
        >
          InvoiceFlow
        </span>
        <span
          className={cn(
            'block text-[11px] leading-4',
            inverted ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          Invoice management
        </span>
      </span>
    </div>
  );
}
