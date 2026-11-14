import type { SortDirection } from '@/lib/api';

import type { CustomerSortField } from '../api/types';

export const CUSTOMER_DEFAULT_PAGE_SIZE = 20;
export const CUSTOMER_MAX_PAGE_SIZE = 100;
export const CUSTOMER_DEFAULT_SORT_BY: CustomerSortField = 'name';
export const CUSTOMER_DEFAULT_SORT_DIRECTION: SortDirection = 'asc';
export const CUSTOMER_SEARCH_DEBOUNCE_MS = 300;

export const CUSTOMER_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export const CUSTOMER_SORT_FIELDS: readonly CustomerSortField[] = [
  'name',
  'email',
  'createdAt',
  'updatedAt',
];

export const CUSTOMER_SORT_LABELS: Readonly<Record<CustomerSortField, string>> = {
  name: 'Name',
  email: 'E-mail',
  createdAt: 'Created date',
  updatedAt: 'Updated date',
};

export interface CustomerListState {
  page: number;
  pageSize: number;
  search: string;
  sortBy: CustomerSortField;
  sortDirection: SortDirection;
}

function parseInteger(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/** Parses arbitrary URL parameters into safe, backend-supported list state. */
export function parseCustomerListState(params: URLSearchParams): CustomerListState {
  const page = parseInteger(params.get('page'));
  const pageSize = parseInteger(params.get('pageSize'));
  const sortBy = params.get('sortBy');
  const sortDirection = params.get('sortDirection');

  return {
    page: page !== undefined && page >= 1 ? page : 1,
    pageSize:
      pageSize !== undefined && pageSize >= 1 && pageSize <= CUSTOMER_MAX_PAGE_SIZE
        ? pageSize
        : CUSTOMER_DEFAULT_PAGE_SIZE,
    search: params.get('search')?.trim() ?? '',
    sortBy: CUSTOMER_SORT_FIELDS.includes(sortBy as CustomerSortField)
      ? (sortBy as CustomerSortField)
      : CUSTOMER_DEFAULT_SORT_BY,
    sortDirection: sortDirection === 'desc' ? 'desc' : CUSTOMER_DEFAULT_SORT_DIRECTION,
  };
}

/**
 * Builds canonical list parameters. Defaults are omitted so normal list visits keep a
 * clean URL while explicit choices remain shareable and restorable.
 */
export function buildCustomerListSearch(state: CustomerListState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.page !== 1) {
    params.set('page', String(state.page));
  }

  if (state.pageSize !== CUSTOMER_DEFAULT_PAGE_SIZE) {
    params.set('pageSize', String(state.pageSize));
  }

  if (state.search !== '') {
    params.set('search', state.search);
  }

  if (state.sortBy !== CUSTOMER_DEFAULT_SORT_BY) {
    params.set('sortBy', state.sortBy);
  }

  if (state.sortDirection !== CUSTOMER_DEFAULT_SORT_DIRECTION) {
    params.set('sortDirection', state.sortDirection);
  }

  return params;
}

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guards API calls and route rendering against malformed route identifiers. */
export function isCustomerId(value: string | undefined): value is string {
  return value !== undefined && GUID_PATTERN.test(value);
}

/**
 * Returns a safe internal list path from router state. Detail pages pass their previous
 * list location through state so Back, Cancel, and delete navigation preserve filters.
 */
export function safeCustomerListPath(value: unknown): string {
  if (typeof value !== 'string') {
    return '/customers';
  }

  if (
    !value.startsWith('/customers') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.includes('\r') ||
    value.includes('\n')
  ) {
    return '/customers';
  }

  return value;
}

/** Reads the list location that detail/create/edit pages pass through router state. */
export function listPathFromRouterState(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'fromList' in state) {
    return safeCustomerListPath((state as { fromList?: unknown }).fromList);
  }

  return '/customers';
}
