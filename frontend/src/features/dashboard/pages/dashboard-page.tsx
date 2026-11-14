import type { ReactNode } from 'react';

import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CircleDollarSign,
  FileClock,
  FilePlus2,
  ReceiptText,
  RefreshCw,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { describeCustomerReadError } from '@/features/customers/utils/customer-errors';
import { InvoiceStatusBadge } from '@/features/invoices/components/invoice-status-badge';
import { describeInvoiceReadError } from '@/features/invoices/utils/invoice-errors';
import { formatInvoiceMoney, formatInvoiceTimestamp } from '@/features/invoices/utils/format';

import type { DashboardStatusCounts } from '../api/contracts';
import {
  useDashboardCustomers,
  useDashboardFinancials,
  useDashboardRecentInvoices,
  useDashboardStatusCounts,
} from '../hooks/use-dashboard';
import { formatDashboardTry } from '../utils/dashboard-financials';

const statusPresentation = [
  { status: 'Draft', color: 'bg-slate-500' },
  { status: 'Sent', color: 'bg-blue-600' },
  { status: 'Paid', color: 'bg-emerald-600' },
  { status: 'Cancelled', color: 'bg-red-600' },
] as const;

export function DashboardPage() {
  const recent = useDashboardRecentInvoices();
  const counts = useDashboardStatusCounts();
  const financials = useDashboardFinancials();
  const customers = useDashboardCustomers();
  const hasSectionError =
    recent.isError || counts.isError || financials.isError || customers.isError;
  const financialUnavailable = financials.data?.result.available === false;
  const emptyAccount =
    recent.data?.totalCount === 0 && customers.data?.totalCount === 0 && !hasSectionError;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="An owner-scoped operational summary built from bounded customer and invoice list requests."
        badge="Phase 7"
        actions={
          <Button asChild>
            <Link to="/invoices/new">
              <FilePlus2 aria-hidden="true" />
              Create Invoice
            </Link>
          </Button>
        }
      />

      {hasSectionError || financialUnavailable ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
          <p className="leading-6 text-muted-foreground">
            Some dashboard data is unavailable. Available sections remain accurate and usable; no
            missing value is displayed as zero.
          </p>
        </div>
      ) : null}

      {emptyAccount ? <EmptyDashboard /> : null}

      <section aria-labelledby="financial-overview-heading" className="space-y-4">
        <div>
          <h2 id="financial-overview-heading" className="text-lg font-semibold">
            Financial overview
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete all-invoice values are shown only when the account fits the documented 1,000
            invoice request budget.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FinancialKpi
            title="Issued amount"
            description="Sent + Paid; Draft and Cancelled excluded"
            icon={<ReceiptText aria-hidden="true" />}
            query={financials}
            select={(totals) => totals.issued}
          />
          <FinancialKpi
            title="Paid amount"
            description="Manually marked Paid; not payment verification"
            icon={<CircleDollarSign aria-hidden="true" />}
            query={financials}
            select={(totals) => totals.paid}
          />
          <FinancialKpi
            title="Outstanding amount"
            description="Sent only; Draft and Cancelled excluded"
            icon={<Banknote aria-hidden="true" />}
            query={financials}
            select={(totals) => totals.outstanding}
          />
          <CountKpi counts={counts.data} pending={counts.isPending} error={counts.isError} />
        </div>
        {financials.data ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {financials.data.result.available
              ? `Coverage: all ${financials.data.totalCount.toLocaleString()} visible invoices across ${financials.data.pagesRead} bounded page${financials.data.pagesRead === 1 ? '' : 's'}. Refreshed ${formatRefreshTime(financials.dataUpdatedAt)}.`
              : financials.data.result.reason}
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <RecentInvoicesCard query={recent} />
        </div>
        <div className="xl:col-span-2">
          <StatusDistributionCard query={counts} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CustomerSummaryCard query={customers} />
        <QuickActionsCard />
      </div>
    </div>
  );
}

type FinancialQuery = ReturnType<typeof useDashboardFinancials>;

function FinancialKpi({
  title,
  description,
  icon,
  query,
  select,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  query: FinancialQuery;
  select: (totals: { issued: string; paid: string; outstanding: string }) => string;
}) {
  let value: ReactNode = <Skeleton className="h-8 w-28" />;
  if (query.isError || query.data?.result.available === false) {
    value = <span className="text-lg text-muted-foreground">Unavailable</span>;
  }
  if (query.data?.result.available) {
    value = formatDashboardTry(select(query.data.result.totals));
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">
            {icon}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight" aria-live="polite">
          {value}
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function CountKpi({
  counts,
  pending,
  error,
}: {
  counts: DashboardStatusCounts | undefined;
  pending: boolean;
  error: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Draft invoices
          </CardTitle>
          <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            <FileClock className="size-4" aria-hidden="true" />
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight" aria-live="polite">
          {pending ? (
            <Skeleton className="h-8 w-16" />
          ) : error ? (
            'Unavailable'
          ) : (
            (counts?.Draft ?? 0)
          )}
        </div>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Exact server-filtered count; Draft is not treated as receivable.
        </p>
      </CardContent>
    </Card>
  );
}

function RecentInvoicesCard({ query }: { query: ReturnType<typeof useDashboardRecentInvoices> }) {
  return (
    <Card className="h-full overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Recently created invoices</CardTitle>
            <CardDescription>Latest five, sorted server-side by created time.</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/invoices">
              View all <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {query.isPending ? <TableSkeleton /> : null}
        {query.isError ? (
          <WidgetError
            message={describeInvoiceReadError(query.error).message}
            retry={query.refetch}
          />
        ) : null}
        {query.data?.items.length === 0 ? (
          <EmptyWidget message="No invoices yet. Create a Draft to start tracking activity." />
        ) : null}
        {query.data && query.data.items.length > 0 ? (
          <div className="overflow-x-auto">
            <Table aria-label="Recently created invoices">
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Invoice</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="pr-6 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="pl-6 font-medium">
                      <Link
                        to={`/invoices/${invoice.id}`}
                        state={{ fromList: '/invoices' }}
                        className="underline-offset-4 hover:underline"
                      >
                        {invoice.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <InvoiceStatusBadge status={invoice.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatInvoiceTimestamp(invoice.createdAt)}
                    </TableCell>
                    <TableCell className="pr-6 text-right whitespace-nowrap">
                      {formatInvoiceMoney(invoice.grandTotal, invoice.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusDistributionCard({ query }: { query: ReturnType<typeof useDashboardStatusCounts> }) {
  if (query.isPending) return <WidgetSkeleton title="Invoice status distribution" rows={4} />;
  if (query.isError || query.data === undefined) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Invoice status distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <WidgetError
            message={describeInvoiceReadError(query.error).message}
            retry={query.refetch}
          />
        </CardContent>
      </Card>
    );
  }

  const total = Object.values(query.data).reduce((sum, count) => sum + count, 0);
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Invoice status distribution</CardTitle>
        <CardDescription>
          Exact counts from four server-filtered totalCount queries.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyWidget message="No invoices are available for distribution." />
        ) : (
          <ul className="space-y-4" aria-label="Invoice status counts">
            {statusPresentation.map(({ status, color }) => {
              const count = query.data[status];
              const percentage = (count / total) * 100;
              return (
                <li key={status} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{status}</span>
                    <span className="text-muted-foreground">
                      {count} · {Math.round(percentage)}%
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={`${status}: ${count} of ${total} invoices`}
                    className="h-2 overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className={`h-full rounded-full ${color}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CustomerSummaryCard({ query }: { query: ReturnType<typeof useDashboardCustomers> }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Customers</CardTitle>
            <CardDescription>
              Total count and three most recently created customers.
            </CardDescription>
          </div>
          <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Users className="size-5" aria-hidden="true" />
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {query.isPending ? <WidgetRowsSkeleton rows={3} /> : null}
        {query.isError ? (
          <WidgetError
            message={describeCustomerReadError(query.error).message}
            retry={query.refetch}
          />
        ) : null}
        {query.data ? (
          <>
            <p className="text-3xl font-semibold">{query.data.totalCount}</p>
            <p className="text-xs text-muted-foreground">Exact owner-scoped total</p>
            {query.data.items.length > 0 ? (
              <ul className="mt-5 divide-y" aria-label="Recently created customers">
                {query.data.items.map((customer) => (
                  <li key={customer.id}>
                    <Link
                      to={`/customers/${customer.id}`}
                      className="flex items-center justify-between gap-3 py-3 text-sm font-medium underline-offset-4 hover:underline"
                    >
                      <span className="truncate">{customer.name}</span>
                      <ArrowRight
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">No customers yet.</p>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function QuickActionsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
        <CardDescription>Continue with the core InvoiceFlow workflows.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
        <QuickAction to="/invoices/new" label="Create Invoice" icon={<FilePlus2 />} />
        <QuickAction to="/invoices" label="View Invoices" icon={<ReceiptText />} />
        <QuickAction to="/customers" label="Manage Customers" icon={<Users />} />
      </CardContent>
    </Card>
  );
}

function QuickAction({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <Button asChild variant="outline" className="h-auto justify-start py-4">
      <Link to={to}>
        <span className="text-primary [&_svg]:size-4" aria-hidden="true">
          {icon}
        </span>
        {label}
      </Link>
    </Button>
  );
}

function EmptyDashboard() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <FilePlus2 className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold">Start your InvoiceFlow workspace</h2>
          <p className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
            Add a customer, then create a Draft invoice. Dashboard values will appear from real API
            data.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/customers/new">Add first customer</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function WidgetError({ message, retry }: { message: string; retry: () => unknown }) {
  return (
    <div className="flex flex-col items-start gap-3 px-6 py-8 text-sm">
      <div className="flex items-start gap-2 text-destructive">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>{message}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void retry()}>
        <RefreshCw aria-hidden="true" />
        Retry
      </Button>
    </div>
  );
}

function EmptyWidget({ message }: { message: string }) {
  return <p className="px-6 py-10 text-center text-sm text-muted-foreground">{message}</p>;
}

function TableSkeleton() {
  return (
    <div className="space-y-3 px-6 pb-6" aria-label="Loading recent invoices">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

function WidgetRowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3" aria-label="Loading dashboard data">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
    </div>
  );
}

function WidgetSkeleton({ title, rows }: { title: string; rows: number }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <WidgetRowsSkeleton rows={rows} />
      </CardContent>
    </Card>
  );
}

function formatRefreshTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
    timestamp,
  );
}
