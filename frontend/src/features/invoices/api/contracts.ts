import { z } from 'zod';

import type { ApiClient } from '@/lib/api';
import { endpoints } from '@/lib/api';

import type {
  CreateInvoiceRequest,
  Invoice,
  InvoiceListQuery,
  InvoiceListResponse,
  InvoiceLifecycleRequest,
  InvoiceSummary,
  UpdateInvoiceRequest,
} from './types';

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestampSchema = z.string().min(1);
const amountSchema = z.number().finite().nonnegative();

const invoiceSummarySchema = z.object({
  id: z.string().min(1),
  invoiceNumber: z.string().min(1),
  customerId: z.string().min(1),
  issueDate: calendarDateSchema,
  dueDate: calendarDateSchema,
  status: z.string().min(1),
  currency: z.string().min(1),
  subtotal: amountSchema,
  taxTotal: amountSchema,
  grandTotal: amountSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema.nullable(),
  concurrencyToken: z.string().min(1),
});

const invoiceItemSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  quantity: z.number().finite().positive(),
  unitPrice: amountSchema,
  taxRate: z.number().finite().min(0).max(100),
  lineSubtotal: amountSchema,
  lineTax: amountSchema,
  lineTotal: amountSchema,
});

const invoiceSchema = invoiceSummarySchema.extend({
  items: z.array(invoiceItemSchema),
});

const invoicePageSchema = z.object({
  items: z.array(invoiceSummarySchema),
  pageNumber: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalCount: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

/** Raised when a successful invoice response does not match the released contract. */
export class InvoiceContractError extends Error {
  constructor() {
    super('The invoice service returned an unexpected response.');
    this.name = 'InvoiceContractError';
  }
}

function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new InvoiceContractError();
  }

  return result.data;
}

export async function listInvoices(
  client: ApiClient,
  query: InvoiceListQuery,
  signal?: AbortSignal,
): Promise<InvoiceListResponse> {
  const payload = await client.get<unknown>(endpoints.invoices.list, {
    query: {
      pageNumber: query.pageNumber,
      pageSize: query.pageSize,
      customerId: query.customerId,
      status: query.status,
      issueDateFrom: query.issueDateFrom,
      issueDateTo: query.issueDateTo,
      search: query.search,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    },
    ...(signal ? { signal } : {}),
  });

  return validate(invoicePageSchema, payload);
}

export async function getInvoice(
  client: ApiClient,
  id: string,
  signal?: AbortSignal,
): Promise<Invoice> {
  const payload = await client.get<unknown>(endpoints.invoices.byId(id), {
    ...(signal ? { signal } : {}),
  });

  return validate(invoiceSchema, payload);
}

export async function createInvoice(
  client: ApiClient,
  request: CreateInvoiceRequest,
): Promise<Invoice> {
  const payload = await client.post<unknown>(endpoints.invoices.list, request);
  return validate(invoiceSchema, payload);
}

export async function updateInvoice(
  client: ApiClient,
  id: string,
  request: UpdateInvoiceRequest,
): Promise<Invoice> {
  const payload = await client.put<unknown>(endpoints.invoices.byId(id), request);
  return validate(invoiceSchema, payload);
}

async function transitionInvoice(
  client: ApiClient,
  path: string,
  request: InvoiceLifecycleRequest,
  signal?: AbortSignal,
): Promise<Invoice> {
  const payload = await client.post<unknown>(path, request, signal ? { signal } : undefined);
  return validate(invoiceSchema, payload);
}

export function sendInvoice(
  client: ApiClient,
  id: string,
  request: InvoiceLifecycleRequest,
  signal?: AbortSignal,
): Promise<Invoice> {
  return transitionInvoice(client, endpoints.invoices.send(id), request, signal);
}

export function markInvoicePaid(
  client: ApiClient,
  id: string,
  request: InvoiceLifecycleRequest,
  signal?: AbortSignal,
): Promise<Invoice> {
  return transitionInvoice(client, endpoints.invoices.markPaid(id), request, signal);
}

export function cancelInvoice(
  client: ApiClient,
  id: string,
  request: InvoiceLifecycleRequest,
  signal?: AbortSignal,
): Promise<Invoice> {
  return transitionInvoice(client, endpoints.invoices.cancel(id), request, signal);
}

export async function deleteInvoice(
  client: ApiClient,
  id: string,
  concurrencyToken: string,
  signal?: AbortSignal,
): Promise<void> {
  await client.delete<void>(endpoints.invoices.byId(id), {
    query: { concurrencyToken },
    ...(signal ? { signal } : {}),
  });
}

export type { Invoice, InvoiceListResponse, InvoiceSummary };
