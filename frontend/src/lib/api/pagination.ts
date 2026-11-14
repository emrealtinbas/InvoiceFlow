/**
 * The API uses two pagination envelopes. They differ in the page-number property name:
 * customers use `page`, invoices use `pageNumber`. Do not unify them client-side; map
 * them at the feature boundary.
 */
export interface PagedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface InvoicePagedResponse<T> {
  items: T[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export type SortDirection = 'asc' | 'desc';
