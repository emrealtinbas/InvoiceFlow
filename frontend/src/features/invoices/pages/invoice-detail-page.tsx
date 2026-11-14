import type { ReactNode } from 'react';

import { AlertCircle, FilePenLine, FileQuestion, RefreshCw, ReceiptText } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCustomer } from '@/features/customers/hooks/use-customers';
import { isApiError } from '@/lib/api';

import { BackToInvoices } from '../components/back-to-invoices';
import { InvoiceLifecycleActions } from '../components/invoice-lifecycle-actions';
import { InvoiceStatusBadge } from '../components/invoice-status-badge';
import { useInvoice } from '../hooks/use-invoices';
import { describeInvoiceReadError } from '../utils/invoice-errors';
import { invoiceStatusDescription } from '../utils/invoice-status';
import { invoiceListPathFromRouterState, isInvoiceId } from '../utils/invoice-list-params';
import {
  formatInvoiceDate,
  formatInvoiceMoney,
  formatInvoiceQuantity,
  formatInvoiceTimestamp,
  formatTaxRate,
} from '../utils/format';

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const fromList = invoiceListPathFromRouterState(location.state);
  const validId = isInvoiceId(id);
  const invoice = useInvoice(validId ? id : undefined);
  const customer = useCustomer(invoice.data?.customerId);

  if (!validId) {
    return <InvoiceNotFound fromList={fromList} />;
  }

  if (invoice.isPending) {
    return (
      <div className="space-y-6">
        <BackToInvoices to={fromList} />
        <PageHeader title="Invoice details" description="Loading the invoice record." />
        <Card>
          <CardContent className="space-y-4">
            <span role="status" className="sr-only">
              Loading invoice…
            </span>
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (invoice.isError && isApiError(invoice.error) && invoice.error.isNotFound) {
    return <InvoiceNotFound fromList={fromList} />;
  }

  if (invoice.isError || invoice.data === undefined) {
    const error = describeInvoiceReadError(invoice.error);

    return (
      <div className="space-y-6">
        <BackToInvoices to={fromList} />
        <PageHeader
          title="Invoice details"
          description="The invoice record could not be loaded."
          badge="Phase 6"
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <AlertCircle className="size-10 text-destructive" aria-hidden="true" />
            <div className="space-y-1">
              <h2 className="font-semibold">Invoice could not be loaded</h2>
              <p className="max-w-md text-sm text-muted-foreground">{error.message}</p>
              {error.correlationId ? (
                <p className="font-mono text-[11px] text-muted-foreground">
                  Reference: {error.correlationId}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={invoice.isFetching}
              onClick={() => void invoice.refetch()}
            >
              <RefreshCw className={invoice.isFetching ? 'animate-spin' : undefined} />
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const value = invoice.data;
  const customerName = customer.data?.name;

  return (
    <div className="space-y-6">
      <BackToInvoices to={fromList} />
      <PageHeader
        title={value.invoiceNumber}
        description="Invoice data and authoritative server-calculated financial totals."
        badge="Phase 6"
        actions={
          <>
            <InvoiceStatusBadge status={value.status} />
            {value.status === 'Draft' ? (
              <Button asChild variant="outline">
                <Link to={`/invoices/${value.id}/edit`} state={{ fromList }}>
                  <FilePenLine aria-hidden="true" />
                  Edit Draft
                </Link>
              </Button>
            ) : null}
            <InvoiceLifecycleActions
              invoice={value}
              fromList={fromList}
              onReloadLatest={async () => {
                const result = await invoice.refetch();
                return result.data !== undefined && !result.isError;
              }}
            />
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ReceiptText className="size-5 text-primary" aria-hidden="true" />
            Invoice overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            <DetailItem label="Customer">
              <Link
                to={`/customers/${value.customerId}`}
                className="underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {customerName ?? value.customerId}
              </Link>
              {customer.isError ? (
                <span className="mt-1 block text-xs text-muted-foreground">
                  Customer details are unavailable.
                </span>
              ) : null}
            </DetailItem>
            <DetailItem label="Issue date">{formatInvoiceDate(value.issueDate)}</DetailItem>
            <DetailItem label="Due date">{formatInvoiceDate(value.dueDate)}</DetailItem>
            <DetailItem label="Currency">{value.currency}</DetailItem>
            <div className="sm:col-span-2 lg:col-span-4">
              <DetailItem label="Lifecycle">
                {invoiceStatusDescription(value.status)} Available actions are derived from the
                latest status; the API remains authoritative.
              </DetailItem>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg">Invoice items</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table aria-label="Invoice items">
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className="pl-4 sm:pl-6">
                  Description
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Quantity
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Unit price
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Tax rate
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Subtotal
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Tax
                </TableHead>
                <TableHead scope="col" className="pr-4 text-right sm:pr-6">
                  Total
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {value.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="min-w-52 pl-4 font-medium sm:pl-6">
                    {item.description}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatInvoiceQuantity(item.quantity)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {formatInvoiceMoney(item.unitPrice, value.currency)}
                  </TableCell>
                  <TableCell className="text-right">{formatTaxRate(item.taxRate)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {formatInvoiceMoney(item.lineSubtotal, value.currency)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {formatInvoiceMoney(item.lineTax, value.currency)}
                  </TableCell>
                  <TableCell className="pr-4 text-right font-medium whitespace-nowrap sm:pr-6">
                    {formatInvoiceMoney(item.lineTotal, value.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Financial summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              <SummaryItem label="Subtotal">
                {formatInvoiceMoney(value.subtotal, value.currency)}
              </SummaryItem>
              <SummaryItem label="Tax total">
                {formatInvoiceMoney(value.taxTotal, value.currency)}
              </SummaryItem>
              <div className="border-t pt-3">
                <SummaryItem label="Grand total" emphasized>
                  {formatInvoiceMoney(value.grandTotal, value.currency)}
                </SummaryItem>
              </div>
            </dl>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              These values are authoritative API totals. The frontend performs no invoice
              calculations.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-5 sm:grid-cols-2">
              <DetailItem label="Created">{formatInvoiceTimestamp(value.createdAt)}</DetailItem>
              <DetailItem label="Last updated">
                {formatInvoiceTimestamp(value.updatedAt)}
              </DetailItem>
              <div className="sm:col-span-2">
                <DetailItem label="Invoice identifier">
                  <span className="font-mono text-xs break-all">{value.id}</span>
                </DetailItem>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InvoiceNotFound({ fromList }: { fromList: string }) {
  return (
    <div className="space-y-6">
      <BackToInvoices to={fromList} />
      <PageHeader
        title="Invoice not found"
        description="The invoice does not exist or is not available to your account."
        badge="Not found"
      />
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <FileQuestion className="size-10 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="font-semibold">This invoice is unavailable</h2>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              It may have been deleted, or it may belong to another account. InvoiceFlow does not
              reveal which.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to={fromList}>Back to invoices</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm leading-6 break-words">{children}</dd>
    </div>
  );
}

function SummaryItem({
  label,
  emphasized = false,
  children,
}: {
  label: string;
  emphasized?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={emphasized ? 'font-semibold' : 'text-sm text-muted-foreground'}>{label}</dt>
      <dd className={emphasized ? 'text-xl font-semibold' : 'font-medium'}>{children}</dd>
    </div>
  );
}
