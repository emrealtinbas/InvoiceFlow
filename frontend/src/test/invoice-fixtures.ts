import type { Invoice, InvoiceListResponse, InvoiceSummary } from '@/features/invoices/api/types';

export const customerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const otherCustomerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const invoiceId = '11111111-1111-4111-8111-111111111111';
export const otherInvoiceId = '22222222-2222-4222-8222-222222222222';

export const invoiceSummary: InvoiceSummary = {
  id: invoiceId,
  invoiceNumber: 'INV-2026-000001',
  customerId,
  issueDate: '2026-11-01',
  dueDate: '2026-11-15',
  status: 'Draft',
  currency: 'TRY',
  subtotal: 3000,
  taxTotal: 600,
  grandTotal: 3600,
  createdAt: '2026-11-01T10:30:00.000Z',
  updatedAt: null,
  concurrencyToken: 'AAAAAQ==',
};

export const paidInvoiceSummary: InvoiceSummary = {
  ...invoiceSummary,
  id: otherInvoiceId,
  invoiceNumber: 'INV-2026-000002',
  customerId: otherCustomerId,
  status: 'Paid',
  subtotal: 0,
  taxTotal: 0,
  grandTotal: 0,
  updatedAt: '2026-11-03T12:15:00.000Z',
  concurrencyToken: 'AAAAAg==',
};

export const invoiceDetail: Invoice = {
  ...invoiceSummary,
  items: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      description: 'API implementation',
      quantity: 2.5,
      unitPrice: 1200,
      taxRate: 20,
      lineSubtotal: 3000,
      lineTax: 600,
      lineTotal: 3600,
    },
  ],
};

export function invoicePage(
  items: InvoiceSummary[],
  overrides: Partial<Omit<InvoiceListResponse, 'items'>> = {},
): InvoiceListResponse {
  const pageSize = overrides.pageSize ?? 20;
  const totalCount = overrides.totalCount ?? items.length;

  return {
    items,
    pageNumber: overrides.pageNumber ?? 1,
    pageSize,
    totalCount,
    totalPages: overrides.totalPages ?? Math.ceil(totalCount / pageSize),
  };
}

export function requestPath(request: { url: string }): string {
  return new URL(request.url).pathname;
}

export function requestSearch(request: { url: string }): URLSearchParams {
  return new URL(request.url).searchParams;
}
