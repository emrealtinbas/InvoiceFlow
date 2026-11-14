import { useMemo } from 'react';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api';

import type { CustomerWriteRequest } from '../api/types';
import { BackToCustomers } from '../components/back-to-customers';
import { CustomerForm } from '../components/customer-form';
import { CustomerNotFound } from '../components/customer-not-found';
import { useCustomer, useUpdateCustomer } from '../hooks/use-customers';
import { customerToFormValues } from '../schemas/customer-schemas';
import { isCustomerId, listPathFromRouterState } from '../utils/customer-list-params';
import { describeCustomerReadError, describeCustomerSaveError } from '../utils/customer-errors';

export function CustomerEditPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const validId = isCustomerId(id);
  const customerQuery = useCustomer(validId ? id : undefined);
  const updateCustomer = useUpdateCustomer();
  const fromList = listPathFromRouterState(location.state);
  const serverError = useMemo(
    () => (updateCustomer.error === null ? null : describeCustomerSaveError(updateCustomer.error)),
    [updateCustomer.error],
  );
  const customer = customerQuery.data;

  function handleSubmit(request: CustomerWriteRequest): void {
    if (id === undefined || updateCustomer.isPending) {
      return;
    }

    updateCustomer.mutate(
      { id, request },
      {
        onSuccess: (updated) => {
          toast.success('Customer updated.');
          navigate(`/customers/${updated.id}`, { state: { fromList } });
        },
      },
    );
  }

  if (!validId) {
    return <CustomerNotFound fromList={fromList} />;
  }

  if (customerQuery.isPending) {
    return (
      <div className="space-y-6">
        <BackToCustomers to={fromList} />
        <PageHeader title="Edit customer" description="Loading the customer record." />
        <Card>
          <CardContent className="space-y-4">
            <span role="status" className="sr-only">
              Loading customer…
            </span>
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
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
          title="Edit customer"
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
      <BackToCustomers to={`/customers/${customer.id}`} label="Back to customer" />
      <PageHeader
        title="Edit customer"
        description="Saving replaces every mutable field with the values below. Customer updates have no concurrency token, so the last successful save wins."
        badge="Phase 3"
      />
      <Card>
        <CardContent>
          <CustomerForm
            key={customer.id}
            defaultValues={customerToFormValues(customer)}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            isPending={updateCustomer.isPending}
            serverError={serverError}
            onSubmit={handleSubmit}
            cancelTo={`/customers/${customer.id}`}
            cancelState={{ fromList }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
