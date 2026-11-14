import { useMemo } from 'react';

import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';

import { BackToInvoices } from '../components/back-to-invoices';
import { InvoiceForm } from '../components/invoice-form';
import { useCreateInvoice } from '../hooks/use-invoices';
import { emptyInvoiceFormValues, type InvoiceFormValues } from '../schemas/invoice-schema';
import { toCreateInvoiceRequest } from '../utils/invoice-form-mappers';
import { describeInvoiceSaveError } from '../utils/invoice-save-errors';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CreateInvoicePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const createInvoice = useCreateInvoice();
  const fromList =
    typeof location.state === 'object' &&
    location.state !== null &&
    'fromList' in location.state &&
    typeof location.state.fromList === 'string'
      ? location.state.fromList
      : '/invoices';
  const serverError = useMemo(
    () => (createInvoice.error === null ? null : describeInvoiceSaveError(createInvoice.error)),
    [createInvoice.error],
  );

  function save(values: InvoiceFormValues): void {
    createInvoice.mutate(toCreateInvoiceRequest(values), {
      onSuccess: (invoice) => {
        toast.success('Draft invoice created.');
        navigate(`/invoices/${invoice.id}`, { state: { fromList }, replace: true });
      },
    });
  }

  return (
    <div className="space-y-6">
      <BackToInvoices to={fromList} />
      <PageHeader
        title="New invoice"
        description="Create a TRY Draft invoice. Totals are previewed with decimal arithmetic and recalculated authoritatively by the API."
        badge="Phase 5"
      />
      <InvoiceForm
        defaultValues={emptyInvoiceFormValues(todayUtc())}
        submitLabel="Save Draft"
        pendingLabel="Saving…"
        isPending={createInvoice.isPending}
        serverError={serverError}
        onSubmit={save}
        cancelTo={fromList}
      />
    </div>
  );
}
