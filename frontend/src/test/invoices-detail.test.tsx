import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  customerId,
  invoiceDetail,
  invoiceId,
  otherInvoiceId,
  requestPath,
} from './invoice-fixtures';
import { createFetchMock, jsonResponse, problemResponse, type RecordedRequest } from './http';
import { renderApp } from './render';

const customer = {
  id: customerId,
  name: 'Acme Studio',
  email: 'billing@acme.test',
  phone: null,
  address: null,
  taxNumber: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: null,
};

function detailFetch(invoiceBody: unknown = invoiceDetail, requests: RecordedRequest[] = []) {
  return createFetchMock((request) => {
    requests.push(request);
    const path = requestPath(request);

    if (request.method === 'GET' && path === `/api/invoices/${invoiceId}`) {
      return jsonResponse(invoiceBody);
    }

    if (request.method === 'GET' && path === `/api/customers/${customerId}`) {
      return jsonResponse(customer);
    }

    return undefined;
  });
}

describe('invoice details', () => {
  it('renders the full invoice, line items, status, and authoritative totals', async () => {
    renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      fetchImpl: detailFetch(),
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: invoiceDetail.invoiceNumber }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Invoice status: Draft')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Invoice items' })).toBeInTheDocument();
    expect(screen.getByText('API implementation')).toBeInTheDocument();
    expect(screen.getByText('2,5')).toBeInTheDocument();
    expect(screen.getByText('Grand total')).toBeInTheDocument();
    expect(screen.getByText(/frontend performs no invoice calculations/i)).toBeInTheDocument();
  });

  it('loads one related customer on details and links to customer management', async () => {
    const requests: RecordedRequest[] = [];
    renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      fetchImpl: detailFetch(invoiceDetail, requests),
    });

    expect(await screen.findByRole('link', { name: customer.name })).toHaveAttribute(
      'href',
      `/customers/${customerId}`,
    );
    expect(
      requests.filter((request) => requestPath(request) === `/api/customers/${customerId}`),
    ).toHaveLength(1);
  });

  it('falls back to the customer identifier when customer details are inaccessible', async () => {
    renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      fetchImpl: createFetchMock((request) => {
        const path = requestPath(request);
        if (path === `/api/invoices/${invoiceId}`) return jsonResponse(invoiceDetail);
        if (path === `/api/customers/${customerId}`) {
          return problemResponse({ title: 'Not Found', status: 404 }, 404);
        }
        return undefined;
      }),
    });

    expect(await screen.findByRole('link', { name: customerId })).toHaveAttribute(
      'href',
      `/customers/${customerId}`,
    );
    expect(await screen.findByText('Customer details are unavailable.')).toBeInTheDocument();
  });

  it.each([
    ['missing', invoiceId],
    ['cross-owner', otherInvoiceId],
  ])('uses the same generic not-found state for a %s invoice', async (_case, id) => {
    renderApp({
      initialEntries: [`/invoices/${id}`],
      fetchImpl: createFetchMock((request) =>
        requestPath(request) === `/api/invoices/${id}`
          ? problemResponse(
              { title: 'Not Found', status: 404, detail: 'The invoice was not found.' },
              404,
            )
          : undefined,
      ),
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Invoice not found' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'It may have been deleted, or it may belong to another account. InvoiceFlow does not reveal which.',
      ),
    ).toBeInTheDocument();
  });

  it('rejects a malformed route id without making an API request', async () => {
    const fetchImpl = createFetchMock(() => undefined);
    renderApp({
      initialEntries: ['/invoices/not-a-guid'],
      fetchImpl,
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Invoice not found' }),
    ).toBeInTheDocument();
  });

  it('renders an unknown status through a safe accessible fallback', async () => {
    renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      fetchImpl: detailFetch({ ...invoiceDetail, status: 'Archived' }),
    });

    expect(await screen.findByLabelText('Invoice status: Unknown')).toBeInTheDocument();
    expect(
      screen.getByText(/service returned an unrecognized invoice status/i),
    ).toBeInTheDocument();
  });

  it('formats TRY amounts and preserves zero-value totals', async () => {
    renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      fetchImpl: detailFetch({
        ...invoiceDetail,
        subtotal: 0,
        taxTotal: 0,
        grandTotal: 0,
        items: [
          {
            ...invoiceDetail.items[0],
            unitPrice: 0,
            lineSubtotal: 0,
            lineTax: 0,
            lineTotal: 0,
          },
        ],
      }),
    });

    await screen.findByRole('heading', { level: 1, name: invoiceDetail.invoiceNumber });
    expect(screen.getAllByText(/₺/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0,00/).length).toBeGreaterThanOrEqual(3);
  });

  it('does not silently display an unsafe JSON monetary value', async () => {
    renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      fetchImpl: detailFetch({
        ...invoiceDetail,
        grandTotal: Number('9999999999999999'),
      }),
    });

    expect(await screen.findByText('Amount unavailable')).toBeInTheDocument();
  });

  it('formats calendar dates without converting them through the local timezone', async () => {
    renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      fetchImpl: detailFetch({
        ...invoiceDetail,
        issueDate: '2026-01-01',
        dueDate: '2026-01-15',
      }),
    });

    await screen.findByRole('heading', { level: 1, name: invoiceDetail.invoiceNumber });
    expect(screen.getByText(/1 Oca 2026/)).toBeInTheDocument();
    expect(screen.getByText(/15 Oca 2026/)).toBeInTheDocument();
  });

  it('formats UTC audit timestamps separately from date-only values', async () => {
    renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      fetchImpl: detailFetch({
        ...invoiceDetail,
        updatedAt: '2026-11-03T12:15:00.000Z',
      }),
    });

    await screen.findByRole('heading', { level: 1, name: invoiceDetail.invoiceNumber });
    expect(screen.queryByText('Never updated')).not.toBeInTheDocument();
    expect(screen.getAllByText(/2026/).length).toBeGreaterThan(1);
  });

  it('shows malformed success responses as a retryable contract error', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      queryClient,
      fetchImpl: detailFetch({ id: invoiceId, status: 'Draft' }),
    });

    expect(await screen.findByText('Invoice could not be loaded')).toBeInTheDocument();
    expect(
      screen.getByText('The invoice service returned an unexpected response. Please try again.'),
    ).toBeInTheDocument();
  });

  it('offers Draft editing and lifecycle actions without mutating before confirmation', async () => {
    const requests: RecordedRequest[] = [];
    const { router } = renderApp({
      fetchImpl: detailFetch(invoiceDetail, requests),
    });

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await router.navigate(`/invoices/${invoiceId}`, {
      state: { fromList: '/invoices?status=Draft&pageNumber=2' },
    });
    await screen.findByRole('heading', { level: 1, name: invoiceDetail.invoiceNumber });
    expect(screen.getByRole('link', { name: 'Back to invoices' })).toHaveAttribute(
      'href',
      '/invoices?status=Draft&pageNumber=2',
    );
    expect(screen.getByRole('link', { name: 'Edit Draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });
});
