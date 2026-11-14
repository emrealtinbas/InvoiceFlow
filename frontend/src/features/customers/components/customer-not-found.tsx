import { UserX } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import { BackToCustomers } from './back-to-customers';

/**
 * A single not-found presentation for missing and cross-owner records. The backend
 * deliberately returns 404 for both, so the UI never implies that a record exists.
 */
export function CustomerNotFound({ fromList }: { fromList: string }) {
  return (
    <div className="space-y-6">
      <BackToCustomers to={fromList} />
      <PageHeader
        title="Customer not found"
        description="The customer does not exist or is not available to your account."
        badge="Not found"
      />
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <UserX className="size-6" aria-hidden="true" />
          </span>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              This customer is unavailable
            </h2>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              It may have been deleted, or it may belong to another account. InvoiceFlow does not
              reveal which.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to={fromList}>Back to customers</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
