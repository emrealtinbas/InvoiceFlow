import { FileQuestion } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center sm:py-24">
      <span className="mb-5 grid size-14 place-items-center rounded-2xl border bg-card text-muted-foreground shadow-sm">
        <FileQuestion className="size-7" aria-hidden="true" />
      </span>
      <Badge variant="outline">HTTP 404</Badge>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Page not found</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-pretty text-muted-foreground">
        The address you requested does not match a page in InvoiceFlow Web. It may have moved, or
        the link may be incorrect.
      </p>
      <Button asChild className="mt-6">
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
