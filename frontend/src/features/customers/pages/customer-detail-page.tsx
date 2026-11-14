import { useRef, useState, type ReactNode } from 'react';

import { AlertCircle, Pencil, RefreshCw, Trash2, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api';

import { BackToCustomers } from '../components/back-to-customers';
import { CustomerNotFound } from '../components/customer-not-found';
import { DeleteCustomerDialog } from '../components/delete-customer-dialog';
import { useCustomer } from '../hooks/use-customers';
import { isCustomerId, listPathFromRouterState } from '../utils/customer-list-params';
import { describeCustomerReadError } from '../utils/customer-errors';
import { formatCustomerDateTime } from '../utils/format';

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const validId = isCustomerId(id);
  const customerQuery = useCustomer(validId ? id : undefined);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const fromList = listPathFromRouterState(location.state);
  const customer = customerQuery.data;

  function handleDeleted(): void {
    setDeleteOpen(false);
    navigate(fromList, { replace: true });
  }

  if (!validId) {
    return <CustomerNotFound fromList={fromList} />;
  }

  if (customerQuery.isPending) {
    return (
      <div className="space-y-6">
        <BackToCustomers to={fromList} />
        <PageHeader title="Customer details" description="Loading the customer record." />
        <Card>
          <CardContent className="space-y-4">
            <span role="status" className="sr-only">
              Loading customer…
            </span>
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-4 w-3/4 max-w-sm" />
            <Skeleton className="h-28 w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (customerQuery.isError && isApiError(customerQuery.error) && customerQuery.error.isNotFound) {
    return <CustomerNotFound fromList={fromList} />;
  }

  if (customerQuery.isError || customer === undefined) {
    const description = describeCustomerReadError(customerQuery.error);

    return (
      <div className="space-y-6">
        <BackToCustomers to={fromList} />
        <PageHeader
          title="Customer details"
          description="The customer record could not be loaded."
          badge="Phase 3"
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="size-6" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">
                Customer could not be loaded
              </h2>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                {description.message}
              </p>
              {description.correlationId ? (
                <p className="font-mono text-[11px] text-muted-foreground">
                  Reference: {description.correlationId}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void customerQuery.refetch()}
              disabled={customerQuery.isFetching}
            >
              <RefreshCw
                className={customerQuery.isFetching ? 'animate-spin' : undefined}
                aria-hidden="true"
              />
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackToCustomers to={fromList} />

      <PageHeader
        title={customer.name}
        description="Customer details are loaded from the InvoiceFlow API. Edits replace the full record and use last-write-wins semantics."
        badge="Customer"
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={`/customers/${customer.id}/edit`} state={{ fromList }}>
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            </Button>
            <Button
              type="button"
              variant="destructive"
              aria-label={`Delete ${customer.name}`}
              ref={deleteTriggerRef}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 aria-hidden="true" />
              Delete
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <UserRound className="size-5" aria-hidden="true" />
            </span>
            <CardTitle className="text-lg">Customer information</CardTitle>
            <Badge variant="outline">Owned by your account</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <DetailItem label="Customer name">{customer.name}</DetailItem>
            <DetailItem label="E-mail address">{customer.email ?? 'Not provided'}</DetailItem>
            <DetailItem label="Phone">{customer.phone ?? 'Not provided'}</DetailItem>
            <DetailItem label="Tax number">{customer.taxNumber ?? 'Not provided'}</DetailItem>
            <div className="sm:col-span-2">
              <DetailItem label="Address">
                <span className="whitespace-pre-line">{customer.address ?? 'Not provided'}</span>
              </DetailItem>
            </div>
            <DetailItem label="Created">{formatCustomerDateTime(customer.createdAt)}</DetailItem>
            <DetailItem label="Last updated">
              {customer.updatedAt === null
                ? 'Never updated'
                : formatCustomerDateTime(customer.updatedAt)}
            </DetailItem>
          </dl>
          <p className="mt-6 border-t pt-4 text-xs leading-5 text-muted-foreground">
            Customers with invoices cannot be deleted. The API checks this and returns a conflict;
            the frontend never removes or reassigns invoices.
          </p>
        </CardContent>
      </Card>

      {/* Keep the dialog mounted so Radix can restore focus to the delete trigger. */}
      <DeleteCustomerDialog
        customer={customer}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={handleDeleted}
        restoreFocusRef={deleteTriggerRef}
      />
    </div>
  );
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm leading-6 break-words text-foreground">{children}</dd>
    </div>
  );
}
