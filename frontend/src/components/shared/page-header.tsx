import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';

interface PageHeaderProps {
  title: string;
  description: string;
  badge?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, badge, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Workspace
          </span>
          {badge ? <Badge variant="outline">{badge}</Badge> : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-pretty text-muted-foreground">
          {description}
        </p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
