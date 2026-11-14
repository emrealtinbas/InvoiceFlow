import { useMemo } from 'react';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api';

import { BackToInvoices } from '../components/back-to-invoices';
import { InvoiceForm } from '../components/invoice-form';
import { useInvoice, useUpdateInvoice } from '../hooks/use-invoices';
import { invoiceToFormValues, type InvoiceFormValues } from '../schemas/invoice-schema';
import { toUpdateInvoiceRequest } from '../utils/invoice-form-mappers';
import { describeInvoiceReadError } from '../utils/invoice-errors';
import { describeInvoiceSaveError } from '../utils/invoice-save-errors';
import { isInvoiceId } from '../utils/invoice-list-params';

export function EditInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const validId = isInvoiceId(id);
  const invoiceQuery = useInvoice(validId ? id : undefined);
  const updateInvoice = useUpdateInvoice();
  const invoice = invoiceQuery.data;
  const fromList =
    typeof location.state === 'object' &&
    location.state !== null &&
    'fromList' in location.state &&
    typeof location.state.fromList === 'string'
      ? location.state.fromList
      : '/invoices';
  const serverError = useMemo(
    () => (updateInvoice.error === null ? null : describeInvoiceSaveError(updateInvoice.error)),
    [updateInvoice.error],
  );

  function save(values: InvoiceFormValues): void {
    if (id === undefined || invoice === undefined) return;
    updateInvoice.mutate(
      { id, request: toUpdateInvoiceRequest(values, invoice.concurrencyToken) },
      {
        onSuccess: (updated) => {
          toast.success('Draft invoice updated.');
          navigate(`/invoices/${updated.id}`, { state: { fromList }, replace: true });
        },
      },
    );
  }

  if (
    !validId ||
    (invoiceQuery.isError && isApiError(invoiceQuery.error) && invoiceQuery.error.isNotFound)
  ) {
    return <EditUnavailable fromList={fromList} />;
  }

  if (invoiceQuery.isPending) {
    return (
      <div className="space-y-6">
        <BackToInvoices to={fromList} />
        <PageHeader title="Edit invoice" description="Loading the latest Draft invoice." />
        <Card>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invoiceQuery.isError || invoice === undefined) {
    const error = describeInvoiceReadError(invoiceQuery.error);
    return (
      <div className="space-y-6">
        <BackToInvoices to={fromList} />
        <PageHeader title="Edit invoice" description="The invoice could not be loaded." />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <p>{error.message}</p>
            <Button type="button" variant="outline" onClick={() => void invoiceQuery.refetch()}>
              <RefreshCw />
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invoice.status !== 'Draft') {
    return (
      <div className="space-y-6">
        <BackToInvoices to={fromList} />
        <PageHeader
          title="Invoice cannot be edited"
          description="Only Draft invoices can be changed."
          badge={invoice.status}
        />
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">
              This invoice is {invoice.status} and is read-only.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to={`/invoices/${invoice.id}`} state={{ fromList }}>
                View invoice
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackToInvoices to={`/invoices/${invoice.id}`} />
      <PageHeader
        title={`Edit ${invoice.invoiceNumber}`}
        description="Saving fully replaces mutable Draft fields and requires the latest opaque concurrency token."
        badge="Draft · Phase 5"
      />
      <InvoiceForm
        key={`${invoice.id}-${invoice.concurrencyToken}`}
        defaultValues={invoiceToFormValues(invoice)}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        isPending={updateInvoice.isPending}
        serverError={serverError}
        onSubmit={save}
        onReloadConflict={() => {
          updateInvoice.reset();
          void invoiceQuery.refetch();
        }}
        cancelTo={`/invoices/${invoice.id}`}
        cancelState={{ fromList }}
      />
    </div>
  );
}

function EditUnavailable({ fromList }: { fromList: string }) {
  return (
    <div className="space-y-6">
      <BackToInvoices to={fromList} />
      <PageHeader
        title="Invoice not found"
        description="The invoice does not exist or is not available to your account."
      />
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-muted-foreground">
            InvoiceFlow does not reveal whether an inaccessible invoice exists.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
