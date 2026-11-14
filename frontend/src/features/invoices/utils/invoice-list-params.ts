import type { SortDirection } from '@/lib/api';

import type { InvoiceSortField, KnownInvoiceStatus } from '../api/types';

export const INVOICE_DEFAULT_PAGE_SIZE = 20;
export const INVOICE_MAX_PAGE_SIZE = 100;
export const INVOICE_DEFAULT_SORT_BY: InvoiceSortField = 'issueDate';
export const INVOICE_DEFAULT_SORT_DIRECTION: SortDirection = 'desc';
export const INVOICE_SEARCH_DEBOUNCE_MS = 300;
export const INVOICE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export const INVOICE_STATUSES: readonly KnownInvoiceStatus[] = [
  'Draft',
  'Sent',
  'Paid',
  'Cancelled',
];

export const INVOICE_SORT_FIELDS: readonly InvoiceSortField[] = [
  'invoiceNumber',
  'issueDate',
  'dueDate',
  'grandTotal',
  'createdAt',
];

export const INVOICE_SORT_LABELS: Readonly<Record<InvoiceSortField, string>> = {
  invoiceNumber: 'Invoice number',
  issueDate: 'Issue date',
  dueDate: 'Due date',
  grandTotal: 'Grand total',
  createdAt: 'Created time',
};

export interface InvoiceListState {
  pageNumber: number;
  pageSize: number;
  search: string;
  customerId: string;
  status: KnownInvoiceStatus | '';
  issueDateFrom: string;
  issueDateTo: string;
  sortBy: InvoiceSortField;
  sortDirection: SortDirection;
}

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseInteger(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function isInvoiceId(value: string | undefined): value is string {
  return value !== undefined && GUID_PATTERN.test(value);
}

export function isCustomerFilterId(value: string): boolean {
  return GUID_PATTERN.test(value);
}

export function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE_PATTERN.exec(value);

  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Converts arbitrary URL values into only parameters accepted by the invoice API. */
export function parseInvoiceListState(params: URLSearchParams): InvoiceListState {
  const pageNumber = parseInteger(params.get('pageNumber'));
  const pageSize = parseInteger(params.get('pageSize'));
  const rawStatus = params.get('status');
  const rawCustomerId = params.get('customerId')?.trim() ?? '';
  const rawFrom = params.get('issueDateFrom') ?? '';
  const rawTo = params.get('issueDateTo') ?? '';
  const issueDateFrom = isCalendarDate(rawFrom) ? rawFrom : '';
  const validTo = isCalendarDate(rawTo) ? rawTo : '';
  const issueDateTo =
    validTo !== '' && (issueDateFrom === '' || validTo >= issueDateFrom) ? validTo : '';
  const rawSortBy = params.get('sortBy');

  return {
    pageNumber: pageNumber !== undefined && pageNumber >= 1 ? pageNumber : 1,
    pageSize:
      pageSize !== undefined && pageSize >= 1 && pageSize <= INVOICE_MAX_PAGE_SIZE
        ? pageSize
        : INVOICE_DEFAULT_PAGE_SIZE,
    search: params.get('search')?.trim() ?? '',
    customerId: isCustomerFilterId(rawCustomerId) ? rawCustomerId : '',
    status: INVOICE_STATUSES.includes(rawStatus as KnownInvoiceStatus)
      ? (rawStatus as KnownInvoiceStatus)
      : '',
    issueDateFrom,
    issueDateTo,
    sortBy: INVOICE_SORT_FIELDS.includes(rawSortBy as InvoiceSortField)
      ? (rawSortBy as InvoiceSortField)
      : INVOICE_DEFAULT_SORT_BY,
    sortDirection: params.get('sortDirection') === 'asc' ? 'asc' : 'desc',
  };
}

export function buildInvoiceListSearch(state: InvoiceListState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.pageNumber !== 1) params.set('pageNumber', String(state.pageNumber));
  if (state.pageSize !== INVOICE_DEFAULT_PAGE_SIZE) params.set('pageSize', String(state.pageSize));
  if (state.search !== '') params.set('search', state.search);
  if (state.customerId !== '') params.set('customerId', state.customerId);
  if (state.status !== '') params.set('status', state.status);
  if (state.issueDateFrom !== '') params.set('issueDateFrom', state.issueDateFrom);
  if (state.issueDateTo !== '') params.set('issueDateTo', state.issueDateTo);
  if (state.sortBy !== INVOICE_DEFAULT_SORT_BY) params.set('sortBy', state.sortBy);
  if (state.sortDirection !== INVOICE_DEFAULT_SORT_DIRECTION) {
    params.set('sortDirection', state.sortDirection);
  }

  return params;
}

export function hasInvoiceFilters(state: InvoiceListState): boolean {
  return (
    state.search !== '' ||
    state.customerId !== '' ||
    state.status !== '' ||
    state.issueDateFrom !== '' ||
    state.issueDateTo !== ''
  );
}

export function safeInvoiceListPath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/invoices') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.includes('\r') ||
    value.includes('\n')
  ) {
    return '/invoices';
  }

  return value;
}

export function invoiceListPathFromRouterState(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'fromList' in state) {
    return safeInvoiceListPath((state as { fromList?: unknown }).fromList);
  }

  return '/invoices';
}
