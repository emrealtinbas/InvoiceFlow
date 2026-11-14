import type { ReactNode } from 'react';

import { AppLogo } from '@/components/shared/app-logo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface FatalErrorViewProps {
  title: string;
  description: string;
  details?: string;
  action?: ReactNode;
}

/** Full-page fallback used before the router is available or when it crashes. */
export function FatalErrorView({ title, description, details, action }: FatalErrorViewProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          <AppLogo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={1} className="text-xl">
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {details ? (
              <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-muted-foreground">
                {details}
              </pre>
            ) : null}
            {action}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
