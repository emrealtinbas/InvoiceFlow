import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  FilterX,
  RefreshCw,
  Search,
  Plus,
  X,
} from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { InvoiceStatusBadge } from '../components/invoice-status-badge';
import { useInvoiceList } from '../hooks/use-invoices';
import { describeInvoiceReadError } from '../utils/invoice-errors';
import {
  buildInvoiceListSearch,
  hasInvoiceFilters,
  INVOICE_PAGE_SIZE_OPTIONS,
  INVOICE_SEARCH_DEBOUNCE_MS,
  INVOICE_SORT_FIELDS,
  INVOICE_SORT_LABELS,
  INVOICE_STATUSES,
  isCustomerFilterId,
  parseInvoiceListState,
  type InvoiceListState,
} from '../utils/invoice-list-params';
import { formatInvoiceDate, formatInvoiceMoney } from '../utils/format';

export function InvoicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const searchString = searchParams.toString();
  const state = useMemo(
    () => parseInvoiceListState(new URLSearchParams(searchString)),
    [searchString],
  );
  const canonicalSearch = useMemo(() => buildInvoiceListSearch(state).toString(), [state]);
  const invoices = useInvoiceList(state);
  const [searchDraft, setSearchDraft] = useState({
    value: state.search,
    syncedUrlSearch: state.search,
  });
  const [customerDraft, setCustomerDraft] = useState({
    value: state.customerId,
    syncedUrlCustomer: state.customerId,
  });
  const [customerError, setCustomerError] = useState('');
  const searchInput = searchDraft.value;
  const customerInput = customerDraft.value;

  if (searchDraft.syncedUrlSearch !== state.search) {
    setSearchDraft({ value: state.search, syncedUrlSearch: state.search });
  }

  if (customerDraft.syncedUrlCustomer !== state.customerId) {
    setCustomerDraft({ value: state.customerId, syncedUrlCustomer: state.customerId });
    setCustomerError('');
  }

  const navigateToState = useCallback(
    (nextState: InvoiceListState, replace = false) => {
      setSearchParams(buildInvoiceListSearch(nextState), { replace });
    },
    [setSearchParams],
  );

  const updateState = useCallback(
    (
      patch: Partial<InvoiceListState>,
      options: { replace?: boolean; resetPage?: boolean } = {},
    ) => {
      navigateToState(
        {
          ...state,
          ...patch,
          ...(options.resetPage ? { pageNumber: 1 } : {}),
        },
        options.replace ?? false,
      );
    },
    [navigateToState, state],
  );

  useEffect(() => {
    if (searchString !== canonicalSearch) {
      setSearchParams(new URLSearchParams(canonicalSearch), { replace: true });
    }
  }, [canonicalSearch, searchString, setSearchParams]);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === state.search) return;

    const timer = window.setTimeout(() => {
      updateState({ search: trimmed }, { replace: true, resetPage: true });
    }, INVOICE_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchInput, state.search, updateState]);

  useEffect(() => {
    if (invoices.data === undefined || invoices.isPlaceholderData) return;

    if (invoices.data.totalPages === 0 && state.pageNumber !== 1) {
      updateState({ pageNumber: 1 }, { replace: true });
    } else if (invoices.data.totalPages > 0 && state.pageNumber > invoices.data.totalPages) {
      updateState({ pageNumber: invoices.data.totalPages }, { replace: true });
    }
  }, [invoices.data, invoices.isPlaceholderData, state.pageNumber, updateState]);

  function clearSearch(): void {
    setSearchDraft((current) => ({ ...current, value: '' }));
    updateState({ search: '' }, { replace: true, resetPage: true });
  }

  function applyCustomerFilter(): void {
    const value = customerInput.trim();

    if (value !== '' && !isCustomerFilterId(value)) {
      setCustomerError('Enter a valid customer identifier.');
      return;
    }

    setCustomerError('');
    updateState({ customerId: value }, { resetPage: true });
  }

  function clearFilters(): void {
    setSearchDraft({ value: '', syncedUrlSearch: '' });
    setCustomerDraft({ value: '', syncedUrlCustomer: '' });
    setCustomerError('');
    navigateToState({
      ...state,
      pageNumber: 1,
      search: '',
      customerId: '',
      status: '',
      issueDateFrom: '',
      issueDateTo: '',
    });
  }

  const data = invoices.data;
  const error = invoices.isError ? describeInvoiceReadError(invoices.error) : null;
  const isRefreshing = invoices.isFetching;
  const retryInvoices = () => {
    void invoices.refetch();
  };
  const totalPages = data === undefined ? 1 : Math.max(data.totalPages, 1);
  const page = data === undefined ? state.pageNumber : Math.min(state.pageNumber, totalPages);
  const firstVisible =
    data === undefined || data.totalCount === 0 ? 0 : (page - 1) * data.pageSize + 1;
  const lastVisible = data === undefined ? 0 : Math.min(page * data.pageSize, data.totalCount);
  const pageSizeOptions = useMemo(
    () =>
      Array.from(new Set([...INVOICE_PAGE_SIZE_OPTIONS, state.pageSize])).sort(
        (left, right) => left - right,
      ),
    [state.pageSize],
  );
  const filtered = hasInvoiceFilters(state);
  const fromList = `${location.pathname}${location.search}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Discover invoices, inspect authoritative totals, and create new Draft invoices."
        badge="Phase 5"
        actions={
          <Button asChild>
            <Link to="/invoices/new" state={{ fromList }}>
              <Plus aria-hidden="true" />
              Create invoice
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-4">
            <form
              role="search"
              className="space-y-2 lg:col-span-2"
              onSubmit={(event) => event.preventDefault()}
            >
              <Label htmlFor="invoice-search">Search invoice number</Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="invoice-search"
                  type="search"
                  value={searchInput}
                  onChange={(event) =>
                    setSearchDraft((current) => ({ ...current, value: event.target.value }))
                  }
                  placeholder="INV-2026-000001"
                  autoComplete="off"
                  className="pr-10 pl-9"
                />
                {searchInput !== '' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-1/2 right-1 -translate-y-1/2"
                    aria-label="Clear invoice search"
                    onClick={clearSearch}
                  >
                    <X aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </form>

            <div className="space-y-2">
              <Label htmlFor="invoice-status">Status</Label>
              <Select
                id="invoice-status"
                value={state.status}
                onChange={(event) =>
                  updateState(
                    { status: event.target.value as InvoiceListState['status'] },
                    { resetPage: true },
                  )
                }
              >
                <option value="">All statuses</option>
                {INVOICE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice-sort-by">Sort by</Label>
              <Select
                id="invoice-sort-by"
                value={state.sortBy}
                onChange={(event) =>
                  updateState(
                    { sortBy: event.target.value as InvoiceListState['sortBy'] },
                    { resetPage: true },
                  )
                }
              >
                {INVOICE_SORT_FIELDS.map((field) => (
                  <option key={field} value={field}>
                    {INVOICE_SORT_LABELS[field]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="invoice-issue-from">Issued from</Label>
              <Input
                id="invoice-issue-from"
                type="date"
                value={state.issueDateFrom}
                onChange={(event) => {
                  const issueDateFrom = event.target.value;
                  updateState(
                    {
                      issueDateFrom,
                      ...(state.issueDateTo !== '' && state.issueDateTo < issueDateFrom
                        ? { issueDateTo: '' }
                        : {}),
                    },
                    { resetPage: true },
                  );
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-issue-to">Issued to</Label>
              <Input
                id="invoice-issue-to"
                type="date"
                min={state.issueDateFrom || undefined}
                value={state.issueDateTo}
                onChange={(event) =>
                  updateState({ issueDateTo: event.target.value }, { resetPage: true })
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="invoice-customer">Customer identifier</Label>
              <div className="flex gap-2">
                <Input
                  id="invoice-customer"
                  value={customerInput}
                  onChange={(event) =>
                    setCustomerDraft((current) => ({
                      ...current,
                      value: event.target.value,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      applyCustomerFilter();
                    }
                  }}
                  placeholder="Customer GUID"
                  aria-invalid={customerError !== '' || undefined}
                  aria-describedby={customerError ? 'invoice-customer-error' : undefined}
                />
                <Button type="button" variant="outline" onClick={applyCustomerFilter}>
                  Apply
                </Button>
              </div>
              {customerError ? (
                <p id="invoice-customer-error" role="alert" className="text-sm text-destructive">
                  {customerError}
                </p>
              ) : (
                <p className="text-xs leading-5 text-muted-foreground">
                  The summary API returns customer identifiers, not customer names.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="invoice-sort-direction">Order</Label>
              <Select
                id="invoice-sort-direction"
                className="w-40"
                value={state.sortDirection}
                onChange={(event) =>
                  updateState(
                    { sortDirection: event.target.value === 'asc' ? 'asc' : 'desc' },
                    { resetPage: true },
                  )
                }
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </Select>
            </div>
            {filtered ? (
              <Button type="button" variant="ghost" onClick={clearFilters}>
                <FilterX aria-hidden="true" />
                Clear filters
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="px-0">
          {invoices.isPending ? (
            <InvoiceTableSkeleton />
          ) : invoices.isError && data === undefined ? (
            <InvoiceErrorState
              message={error?.message ?? 'The invoice data could not be loaded.'}
              correlationId={error?.correlationId}
              retrying={isRefreshing}
              onRetry={retryInvoices}
            />
          ) : data === undefined ? (
            <InvoiceErrorState
              message="The invoice data could not be loaded."
              retrying={isRefreshing}
              onRetry={retryInvoices}
            />
          ) : data.items.length === 0 ? (
            filtered ? (
              <InvoiceNoResultsState onClear={clearFilters} />
            ) : (
              <InvoiceEmptyState />
            )
          ) : (
            <>
              {invoices.isFetching ? (
                <p
                  role="status"
                  className="border-b px-4 py-2 text-xs text-muted-foreground sm:px-6"
                >
                  Refreshing invoices…
                </p>
              ) : null}
              <Table aria-label="Invoices">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col" className="pl-4 sm:pl-6">
                      Invoice
                    </TableHead>
                    <TableHead scope="col">Customer</TableHead>
                    <TableHead scope="col">Issue date</TableHead>
                    <TableHead scope="col" className="hidden md:table-cell">
                      Due date
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Total
                    </TableHead>
                    <TableHead scope="col" className="hidden sm:table-cell">
                      Status
                    </TableHead>
                    <TableHead scope="col" className="pr-4 text-right sm:pr-6">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="pl-4 font-medium sm:pl-6">
                        <Link
                          to={`/invoices/${invoice.id}`}
                          state={{ fromList }}
                          className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                        >
                          {invoice.invoiceNumber}
                        </Link>
                        <div className="mt-1 sm:hidden">
                          <InvoiceStatusBadge status={invoice.status} />
                        </div>
                      </TableCell>
                      <TableCell className="max-w-44 font-mono text-xs break-all text-muted-foreground">
                        <Link
                          to={`/customers/${invoice.customerId}`}
                          className="underline-offset-4 hover:text-foreground hover:underline"
                        >
                          {invoice.customerId}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatInvoiceDate(invoice.issueDate)}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                        {formatInvoiceDate(invoice.dueDate)}
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap">
                        {formatInvoiceMoney(invoice.grandTotal, invoice.currency)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <InvoiceStatusBadge status={invoice.status} />
                      </TableCell>
                      <TableCell className="pr-4 text-right sm:pr-6">
                        <Button asChild variant="ghost" size="icon-sm">
                          <Link
                            to={`/invoices/${invoice.id}`}
                            state={{ fromList }}
                            aria-label={`View ${invoice.invoiceNumber}`}
                          >
                            <Eye aria-hidden="true" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Showing {firstVisible}–{lastVisible} of {data.totalCount}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor="invoice-page-size" className="text-xs text-muted-foreground">
                    Rows per page
                  </Label>
                  <Select
                    id="invoice-page-size"
                    className="h-8 w-20"
                    value={state.pageSize}
                    onChange={(event) =>
                      updateState({ pageSize: Number(event.target.value) }, { resetPage: true })
                    }
                  >
                    {pageSizeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                  <span className="px-1 text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || invoices.isFetching}
                    onClick={() => updateState({ pageNumber: page - 1 })}
                  >
                    <ChevronLeft aria-hidden="true" />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || invoices.isFetching || data.totalPages === 0}
                    onClick={() => updateState({ pageNumber: page + 1 })}
                  >
                    Next
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InvoiceTableSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-3 p-4 sm:p-6">
      <span className="sr-only">Loading invoices…</span>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-4" aria-hidden="true">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

function InvoiceErrorState({
  message,
  correlationId,
  retrying,
  onRetry,
}: {
  message: string;
  correlationId?: string | undefined;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Invoices could not be loaded</h2>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">{message}</p>
        {correlationId ? (
          <p className="font-mono text-[11px] text-muted-foreground">Reference: {correlationId}</p>
        ) : null}
      </div>
      <Button type="button" variant="outline" onClick={onRetry} disabled={retrying}>
        <RefreshCw className={retrying ? 'animate-spin' : undefined} aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}

function InvoiceEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
        <FileText className="size-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">No invoices yet</h2>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          No invoices are available to this account. Invoice creation is intentionally deferred to
          Phase 5.
        </p>
      </div>
    </div>
  );
}

function InvoiceNoResultsState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Search className="size-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">No matching invoices</h2>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          No invoices match the current server-side filters.
        </p>
      </div>
      <Button type="button" variant="outline" onClick={onClear}>
        <FilterX aria-hidden="true" />
        Clear filters
      </Button>
    </div>
  );
}
