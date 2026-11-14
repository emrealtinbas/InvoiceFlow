import type { InvoiceListState } from '../utils/invoice-list-params';

/** Invoice data is scoped by verified user id as defense in depth against account leakage. */
export const invoiceKeys = {
  all: (scope: string) => ['invoices', scope] as const,
  lists: (scope: string) => [...invoiceKeys.all(scope), 'list'] as const,
  list: (scope: string, state: InvoiceListState) => [...invoiceKeys.lists(scope), state] as const,
  details: (scope: string) => [...invoiceKeys.all(scope), 'detail'] as const,
  detail: (scope: string, id: string) => [...invoiceKeys.details(scope), id] as const,
};
