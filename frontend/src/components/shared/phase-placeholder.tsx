import { ArrowRight, Construction, type LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils/cn';

interface EndpointReference {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
}

interface PhasePlaceholderProps {
  icon: LucideIcon;
  phase: string;
  title: string;
  description: string;
  plannedCapabilities: readonly string[];
  endpoints: readonly EndpointReference[];
}

export function PhasePlaceholder({
  icon: Icon,
  phase,
  title,
  description,
  plannedCapabilities,
  endpoints,
}: PhasePlaceholderProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <div className="mb-1 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{phase}</Badge>
              <Badge variant="outline">
                <Construction aria-hidden="true" />
                Coming in a later phase
              </Badge>
            </div>
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Separator className="mb-5" />
          <h2 className="mb-3 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Planned for this phase
          </h2>
          <ul className="space-y-3">
            {plannedCapabilities.map((capability) => (
              <li key={capability} className="flex items-start gap-2.5 text-sm">
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="leading-6 text-foreground">{capability}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Backend support already exists</CardTitle>
          <CardDescription>
            These endpoints are part of the released API. The frontend will consume them unchanged
            in {phase}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {endpoints.map((endpoint) => (
              <li
                key={`${endpoint.method} ${endpoint.path}`}
                className="flex flex-col gap-1 rounded-lg border bg-muted/30 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
              >
                <span
                  className={cn(
                    'w-fit rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide',
                    methodClassName(endpoint.method),
                  )}
                >
                  {endpoint.method}
                </span>
                <code className="font-mono text-xs break-all text-foreground">{endpoint.path}</code>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            No business data is requested yet, so this page never shows placeholder customers or
            invoices.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function methodClassName(method: EndpointReference['method']): string {
  switch (method) {
    case 'GET':
      return 'bg-sky-50 text-sky-700';
    case 'POST':
      return 'bg-emerald-50 text-emerald-700';
    case 'PUT':
      return 'bg-amber-50 text-amber-700';
    case 'DELETE':
      return 'bg-rose-50 text-rose-700';
  }
}
