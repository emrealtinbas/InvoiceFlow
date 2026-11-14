import type { InvoicePagedResponse, SortDirection } from '@/lib/api/pagination';

/** Stable API status values accepted by list filters. */
export type KnownInvoiceStatus = 'Draft' | 'Sent' | 'Paid' | 'Cancelled';

/**
 * Responses are validated as strings so a future server status can render through the
 * badge's safe fallback rather than crashing the whole route.
 */
export type InvoiceStatus = string;

export type InvoiceSortField =
  'invoiceNumber' | 'issueDate' | 'dueDate' | 'grandTotal' | 'createdAt';

/** One client-supplied line. Calculated amounts are never accepted from clients. */
export interface InvoiceItemRequest {
  /** 1–500 characters, must not be blank after trimming. */
  description: string;
  /** Greater than 0, at most 3 decimal places. */
  quantity: number;
  /** 0 or greater, at most 2 decimal places. */
  unitPrice: number;
  /** 0–100 percent, at most 2 decimal places. */
  taxRate: number;
}

export interface InvoiceItem extends InvoiceItemRequest {
  id: string;
  lineSubtotal: number;
  lineTax: number;
  lineTotal: number;
}

export interface CreateInvoiceRequest {
  customerId: string;
  /** Optional `YYYY-MM-DD`; defaults to the current UTC date. */
  issueDate?: string;
  /** Required `YYYY-MM-DD`, on or after the issue date. */
  dueDate: string;
  /** 1–100 items. */
  items: InvoiceItemRequest[];
}

export interface UpdateInvoiceRequest {
  customerId: string;
  /** Required `YYYY-MM-DD` on update. */
  issueDate: string;
  dueDate: string;
  concurrencyToken: string;
  items: InvoiceItemRequest[];
}

export interface InvoiceLifecycleRequest {
  concurrencyToken: string;
}

/** Full invoice representation returned by create, read, update, and lifecycle actions. */
export interface Invoice {
  id: string;
  /** Server-generated `INV-YYYY-NNNNNN`. */
  invoiceNumber: string;
  customerId: string;
  /** ISO 8601 calendar date, no time zone. */
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  /** Fixed to `TRY` in the current API version. */
  currency: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  /** ISO 8601 UTC timestamp. */
  createdAt: string;
  updatedAt: string | null;
  /** Opaque Base64 value backed by PostgreSQL xmin. */
  concurrencyToken: string;
  items: InvoiceItem[];
}

/** List rows omit line items but include the concurrency token. */
export type InvoiceSummary = Omit<Invoice, 'items'>;

/** Invoice lists use `pageNumber`, unlike customer lists which use `page`. */
export interface InvoiceListQuery {
  pageNumber?: number;
  /** 1–100; defaults to 20. */
  pageSize?: number;
  customerId?: string;
  status?: KnownInvoiceStatus;
  issueDateFrom?: string;
  issueDateTo?: string;
  /** Case-insensitive invoice-number search. */
  search?: string;
  sortBy?: InvoiceSortField;
  /** Defaults to `desc` for invoices. */
  sortDirection?: SortDirection;
}

export type InvoiceListResponse = InvoicePagedResponse<InvoiceSummary>;
