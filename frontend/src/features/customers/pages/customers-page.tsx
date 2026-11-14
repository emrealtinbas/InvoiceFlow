import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
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

import type { Customer } from '../api/types';
import { CustomerFormAlert } from '../components/customer-form-alert';
import { DeleteCustomerDialog } from '../components/delete-customer-dialog';
import { useCustomerList } from '../hooks/use-customers';
import {
  buildCustomerListSearch,
  CUSTOMER_PAGE_SIZE_OPTIONS,
  CUSTOMER_SEARCH_DEBOUNCE_MS,
  CUSTOMER_SORT_FIELDS,
  CUSTOMER_SORT_LABELS,
  parseCustomerListState,
  type CustomerListState,
} from '../utils/customer-list-params';
import { describeCustomerReadError } from '../utils/customer-errors';
import { formatCustomerDateTime } from '../utils/format';

export function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const searchString = searchParams.toString();
  const state = useMemo(
    () => parseCustomerListState(new URLSearchParams(searchString)),
    [searchString],
  );
  const canonicalSearch = useMemo(() => buildCustomerListSearch(state).toString(), [state]);
  const list = useCustomerList(state);
  const [searchDraft, setSearchDraft] = useState({
    value: state.search,
    syncedUrlSearch: state.search,
  });
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const searchInput = searchDraft.value;

  // Adjust the draft during render when the URL changes, so Back/Forward and direct
  // links restore the field without an effect that would cascade an extra render.
  if (searchDraft.syncedUrlSearch !== state.search) {
    setSearchDraft({ value: state.search, syncedUrlSearch: state.search });
  }

  const navigateToState = useCallback(
    (nextState: CustomerListState, replace = false) => {
      setSearchParams(buildCustomerListSearch(nextState), { replace });
    },
    [setSearchParams],
  );

  const updateState = useCallback(
    (
      patch: Partial<CustomerListState>,
      options: { replace?: boolean; resetPage?: boolean } = {},
    ) => {
      navigateToState(
        {
          ...state,
          ...patch,
          ...(options.resetPage ? { page: 1 } : {}),
        },
        options.replace ?? false,
      );
    },
    [navigateToState, state],
  );

  // Normalize unsupported or malformed URL values instead of sending them to the API.
  useEffect(() => {
    if (searchString !== canonicalSearch) {
      setSearchParams(new URLSearchParams(canonicalSearch), { replace: true });
    }
  }, [canonicalSearch, searchString, setSearchParams]);

  useEffect(() => {
    const trimmed = searchInput.trim();

    if (trimmed === state.search) {
      return;
    }

    const timer = window.setTimeout(() => {
      updateState({ search: trimmed }, { replace: true, resetPage: true });
    }, CUSTOMER_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [searchInput, state.search, updateState]);

  // Deletions and stale URLs can leave a page beyond the last page. Move to a valid page.
  useEffect(() => {
    if (list.data === undefined || list.isPlaceholderData) {
      return;
    }

    if (list.data.totalPages === 0) {
      if (state.page !== 1) {
        updateState({ page: 1 }, { replace: true });
      }

      return;
    }

    if (state.page > list.data.totalPages) {
      updateState({ page: list.data.totalPages }, { replace: true });
    }
  }, [list.data, list.isPlaceholderData, state.page, updateState]);

  function handleSortByChange(value: string): void {
    updateState({ sortBy: value as CustomerListState['sortBy'] }, { resetPage: true });
  }

  function handleSortDirectionChange(value: string): void {
    updateState({ sortDirection: value === 'desc' ? 'desc' : 'asc' }, { resetPage: true });
  }

  function handlePageSizeChange(value: string): void {
    const pageSize = Number(value);
    updateState({ pageSize: Number.isSafeInteger(pageSize) ? pageSize : 20 }, { resetPage: true });
  }

  function handleClearSearch(): void {
    setSearchDraft((current) => ({ ...current, value: '' }));
    updateState({ search: '' }, { replace: true, resetPage: true });
  }

  function handleDeleted(): void {
    const shouldMoveBack =
      state.page > 1 && list.data !== undefined && list.data.items.length === 1;

    setDeleteOpen(false);
    setDeleteTarget(null);

    if (shouldMoveBack) {
      updateState({ page: state.page - 1 }, { replace: true });
    }
  }

  const readError = list.isError ? describeCustomerReadError(list.error) : null;
  const isRefreshing = list.isFetching;
  const retryCustomers = () => {
    void list.refetch();
  };
  const data = list.data;
  const totalPages = data === undefined ? 1 : Math.max(data.totalPages, 1);
  const page = data === undefined ? state.page : Math.min(state.page, totalPages);
  const firstVisible =
    data === undefined || data.totalCount === 0 ? 0 : (page - 1) * data.pageSize + 1;
  const lastVisible =
    data === undefined ? 0 : Math.min(page * data.pageSize, Math.max(data.totalCount, 0));
  const pageSizeOptions = useMemo(
    () =>
      Array.from(new Set([...CUSTOMER_PAGE_SIZE_OPTIONS, state.pageSize])).sort(
        (left, right) => left - right,
      ),
    [state.pageSize],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Search, sort, and manage the customer records available to your account. The API applies ownership isolation and returns another owner's customer as not found."
        badge="Phase 3"
        actions={
          <Button asChild>
            <Link
              to="/customers/new"
              state={{ fromList: `${location.pathname}${location.search}` }}
            >
              <Plus aria-hidden="true" />
              Add customer
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-4 pt-0 md:grid-cols-[minmax(0,1fr)_12rem_11rem]">
          <form
            role="search"
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <Label htmlFor="customer-search">Search customers</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="customer-search"
                type="search"
                value={searchInput}
                onChange={(event) =>
                  setSearchDraft((current) => ({ ...current, value: event.target.value }))
                }
                placeholder="Name, e-mail, or tax number"
                className="pr-10 pl-9"
                autoComplete="off"
              />
              {searchInput !== '' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1/2 right-1 -translate-y-1/2"
                  aria-label="Clear search"
                  onClick={handleClearSearch}
                >
                  <X aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </form>

          <div className="space-y-2">
            <Label htmlFor="customer-sort-by">Sort by</Label>
            <Select
              id="customer-sort-by"
              value={state.sortBy}
              onChange={(event) => handleSortByChange(event.target.value)}
            >
              {CUSTOMER_SORT_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {CUSTOMER_SORT_LABELS[field]}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer-sort-direction">Order</Label>
            <Select
              id="customer-sort-direction"
              value={state.sortDirection}
              onChange={(event) => handleSortDirectionChange(event.target.value)}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="px-0">
          {list.isPending ? (
            <CustomerTableSkeleton />
          ) : list.isError && data === undefined ? (
            <CustomerErrorState
              message={readError?.message ?? 'The customer data could not be loaded.'}
              correlationId={readError?.correlationId}
              onRetry={retryCustomers}
              retrying={isRefreshing}
            />
          ) : data === undefined ? (
            <CustomerErrorState
              message="The customer data could not be loaded."
              onRetry={retryCustomers}
              retrying={isRefreshing}
            />
          ) : data.items.length === 0 ? (
            state.search === '' ? (
              <CustomerEmptyState fromList={`${location.pathname}${location.search}`} />
            ) : (
              <CustomerNoResultsState search={state.search} onClear={handleClearSearch} />
            )
          ) : (
            <>
              {list.isError && readError ? (
                <div className="px-4 pt-4 sm:px-6">
                  <CustomerFormAlert
                    message={readError.message}
                    correlationId={readError.correlationId}
                  />
                </div>
              ) : null}
              <div aria-busy={list.isFetching} className="relative">
                {list.isFetching && !list.isPlaceholderData ? (
                  <span className="sr-only" role="status">
                    Refreshing customers…
                  </span>
                ) : null}
                <Table aria-label="Customers">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col" className="pl-4 sm:pl-6">
                        Name
                      </TableHead>
                      <TableHead scope="col">E-mail</TableHead>
                      <TableHead scope="col" className="hidden lg:table-cell">
                        Phone
                      </TableHead>
                      <TableHead scope="col" className="hidden md:table-cell">
                        Created
                      </TableHead>
                      <TableHead scope="col" className="pr-4 text-right sm:pr-6">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell className="pl-4 font-medium sm:pl-6">
                          <Link
                            to={`/customers/${customer.id}`}
                            state={{ fromList: `${location.pathname}${location.search}` }}
                            className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            {customer.name}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-56 break-all text-muted-foreground">
                          {customer.email ?? <span aria-label="Not provided">—</span>}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground lg:table-cell">
                          {customer.phone ?? <span aria-label="Not provided">—</span>}
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                          {formatCustomerDateTime(customer.createdAt)}
                        </TableCell>
                        <TableCell className="pr-4 sm:pr-6">
                          <div className="flex items-center justify-end gap-1">
                            <Button asChild variant="ghost" size="icon-sm">
                              <Link
                                to={`/customers/${customer.id}/edit`}
                                state={{ fromList: `${location.pathname}${location.search}` }}
                                aria-label={`Edit ${customer.name}`}
                              >
                                <Pencil aria-hidden="true" />
                              </Link>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Delete ${customer.name}`}
                              onClick={(event) => {
                                deleteTriggerRef.current = event.currentTarget;
                                setDeleteTarget(customer);
                                setDeleteOpen(true);
                              }}
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {data.totalCount === 0
                    ? 'No customers'
                    : `Showing ${firstVisible}–${lastVisible} of ${data.totalCount}`}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor="customer-page-size" className="text-xs text-muted-foreground">
                    Rows per page
                  </Label>
                  <Select
                    id="customer-page-size"
                    className="h-8 w-20"
                    value={state.pageSize}
                    onChange={(event) => handlePageSizeChange(event.target.value)}
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
                    disabled={page <= 1 || list.isFetching}
                    onClick={() => updateState({ page: page - 1 })}
                  >
                    <ChevronLeft aria-hidden="true" />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || list.isFetching || data.totalPages === 0}
                    onClick={() => updateState({ page: page + 1 })}
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

      {/* The target is retained after closing so focus can return to the delete trigger. */}
      {deleteTarget ? (
        <DeleteCustomerDialog
          customer={deleteTarget}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={handleDeleted}
          restoreFocusRef={deleteTriggerRef}
        />
      ) : null}
    </div>
  );
}

function CustomerTableSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-3 p-4 sm:p-6">
      <span className="sr-only">Loading customers…</span>
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-4" aria-hidden="true">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-4 w-24 md:block" />
          <Skeleton className="h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

interface CustomerErrorStateProps {
  message: string;
  correlationId?: string | undefined;
  onRetry: () => void;
  retrying: boolean;
}

function CustomerErrorState({
  message,
  correlationId,
  onRetry,
  retrying,
}: CustomerErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">Customers could not be loaded</h2>
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

function CustomerEmptyState({ fromList }: { fromList: string }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
        <Users className="size-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">No customers yet</h2>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          Add a customer to start creating invoices. Customers are private to your account unless
          you are an administrator.
        </p>
      </div>
      <Button asChild>
        <Link to="/customers/new" state={{ fromList }}>
          <Plus aria-hidden="true" />
          Add customer
        </Link>
      </Button>
    </div>
  );
}

interface CustomerNoResultsStateProps {
  search: string;
  onClear: () => void;
}

function CustomerNoResultsState({ search, onClear }: CustomerNoResultsStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Search className="size-6" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-foreground">No matching customers</h2>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          No customers match “{search}”. Try a different name, e-mail address, or tax number.
        </p>
      </div>
      <Button type="button" variant="outline" onClick={onClear}>
        <X aria-hidden="true" />
        Clear search
      </Button>
    </div>
  );
}
