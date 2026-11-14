import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Customer } from '@/features/customers/api/types';
import type { InvoiceSummary } from '@/features/invoices/api/types';

import { acmeCustomer, customerPage } from './customer-fixtures';
import { invoicePage, invoiceSummary, requestPath, requestSearch } from './invoice-fixtures';
import { createFetchMock, jsonResponse, problemResponse, type RecordedRequest } from './http';
import { renderApp } from './render';

const secondCustomer: Customer = {
  ...acmeCustomer,
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  name: 'Beta Labs',
  createdAt: '2026-11-02T10:00:00Z',
};

function invoice(status: string, total: number, sequence: number): InvoiceSummary {
  return {
    ...invoiceSummary,
    id: `11111111-1111-4111-8111-${String(sequence).padStart(12, '0')}`,
    invoiceNumber: `INV-2026-${String(sequence).padStart(6, '0')}`,
    status,
    grandTotal: total,
    createdAt: `2026-11-${String(10 - sequence).padStart(2, '0')}T10:00:00Z`,
  };
}

const dashboardInvoices = [
  invoice('Draft', 100, 1),
  invoice('Sent', 200.1, 2),
  invoice('Paid', 300.2, 3),
  invoice('Cancelled', 400, 4),
];

function dashboardFetch(
  requests: RecordedRequest[],
  options: {
    invoices?: InvoiceSummary[];
    customers?: Customer[];
    failRecent?: boolean;
    financialTotalCount?: number;
  } = {},
) {
  const invoices = options.invoices ?? dashboardInvoices;
  const customers = options.customers ?? [secondCustomer, acmeCustomer];

  return createFetchMock((request) => {
    requests.push(request);
    const path = requestPath(request);
    const search = requestSearch(request);

    if (path === '/api/customers') {
      return jsonResponse(
        customerPage(customers.slice(0, 3), {
          page: 1,
          pageSize: 3,
          totalCount: customers.length,
          totalPages: customers.length === 0 ? 0 : 1,
        }),
      );
    }

    if (path === '/api/invoices') {
      const pageSize = Number(search.get('pageSize'));
      const pageNumber = Number(search.get('pageNumber'));
      const status = search.get('status');

      if (pageSize === 5 && options.failRecent) {
        return problemResponse({ title: 'Unavailable', status: 503 }, 503);
      }
      if (status) {
        const matches = invoices.filter((candidate) => candidate.status === status);
        return jsonResponse(
          invoicePage(matches.slice(0, 1), {
            pageNumber: 1,
            pageSize: 1,
            totalCount: matches.length,
            totalPages: matches.length === 0 ? 0 : matches.length,
          }),
        );
      }
      if (pageSize === 5) {
        return jsonResponse(
          invoicePage(invoices.slice(0, 5), {
            pageNumber: 1,
            pageSize: 5,
            totalCount: invoices.length,
            totalPages: invoices.length === 0 ? 0 : 1,
          }),
        );
      }
      if (pageSize === 100) {
        const totalCount = options.financialTotalCount ?? invoices.length;
        const pageStart = (pageNumber - 1) * 100;
        return jsonResponse(
          invoicePage(invoices.slice(pageStart, pageStart + 100), {
            pageNumber,
            pageSize: 100,
            totalCount,
            totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / 100),
          }),
        );
      }
    }

    return undefined;
  });
}

describe('dashboard', () => {
  it('renders complete KPIs, exact status counts, recent data, customers, and shortcuts', async () => {
    const requests: RecordedRequest[] = [];
    renderApp({ fetchImpl: dashboardFetch(requests) });

    expect(await screen.findByText('₺500,30')).toBeInTheDocument();
    expect(screen.getAllByText('₺300,20').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₺200,10').length).toBeGreaterThan(0);
    expect(screen.getByText(/Coverage: all 4 visible invoices/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Draft: 1 of 4 invoices' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Recently created invoices' })).toBeInTheDocument();
    expect(screen.getByText('Beta Labs')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Create Invoice' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Manage Customers' })).toHaveAttribute(
      'href',
      '/customers',
    );
  });

  it('uses bounded server-side requests with createdAt recent sorting', async () => {
    const requests: RecordedRequest[] = [];
    renderApp({ fetchImpl: dashboardFetch(requests) });
    await screen.findByRole('table', { name: 'Recently created invoices' });

    const recent = requests.find((request) => requestSearch(request).get('pageSize') === '5');
    expect(requestSearch(recent as RecordedRequest).get('sortBy')).toBe('createdAt');
    expect(requestSearch(recent as RecordedRequest).get('sortDirection')).toBe('desc');
    expect(
      requests.filter((request) => requestSearch(request).get('status') !== null),
    ).toHaveLength(4);
  });

  it('shows an honest empty-account onboarding state and real zeros', async () => {
    renderApp({ fetchImpl: dashboardFetch([], { invoices: [], customers: [] }) });

    expect(await screen.findByText('Start your InvoiceFlow workspace')).toBeInTheDocument();
    expect(screen.getAllByText('₺0,00')).toHaveLength(3);
    expect(screen.getByText('No invoices are available for distribution.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add first customer' })).toHaveAttribute(
      'href',
      '/customers/new',
    );
  });

  it('renders loading states without fake zero values', async () => {
    renderApp({
      fetchImpl: createFetchMock(() => new Promise<Response>(() => undefined)),
    });

    expect(await screen.findByText('Financial overview')).toBeInTheDocument();
    expect(
      screen.getAllByLabelText(/Loading dashboard data|Loading recent invoices/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('₺0,00')).not.toBeInTheDocument();
  });

  it('keeps successful widgets visible when recent invoices fail', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderApp({ queryClient, fetchImpl: dashboardFetch([], { failRecent: true }) });

    expect(await screen.findByText('₺500,30')).toBeInTheDocument();
    expect(screen.getByText(/Some dashboard data is unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/invoice service is temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByText('Beta Labs')).toBeInTheDocument();
  });

  it('enforces the 1,000 invoice financial request budget without partial totals', async () => {
    const requests: RecordedRequest[] = [];
    renderApp({ fetchImpl: dashboardFetch(requests, { financialTotalCount: 1001 }) });

    expect(
      // toLocaleString() follows the host locale, so accept both grouping separators.
      await screen.findByText(/Complete aggregation is limited to 1[.,]000 invoices/),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable')).toHaveLength(3);
    expect(
      requests.filter((request) => requestSearch(request).get('pageSize') === '100'),
    ).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Draft: 1 of 4 invoices' })).toBeInTheDocument();
  });

  it('aggregates all financial pages at the 100-row boundary', async () => {
    const requests: RecordedRequest[] = [];
    const invoices = Array.from({ length: 101 }, (_, index) => ({
      ...invoice('Sent', 1, index + 1),
      createdAt: '2026-11-01T10:00:00Z',
    }));
    renderApp({ fetchImpl: dashboardFetch(requests, { invoices }) });

    expect(await screen.findByText(/Coverage: all 101 visible invoices/)).toBeInTheDocument();
    expect(screen.getAllByText('₺101,00').length).toBeGreaterThan(0);
    expect(
      requests.filter((request) => requestSearch(request).get('pageSize') === '100'),
    ).toHaveLength(2);
  });

  it('marks unsafe and unknown financial classifications unavailable', async () => {
    const unsafe = invoice('Paid', Number('9999999999999999'), 8);
    const archived = invoice('Archived', 10, 9);
    const { unmount } = renderApp({ fetchImpl: dashboardFetch([], { invoices: [unsafe] }) });
    expect(await screen.findByText(/cannot be aggregated safely/i)).toBeInTheDocument();
    unmount();

    renderApp({ fetchImpl: dashboardFetch([], { invoices: [archived] }) });
    expect(await screen.findByText(/unrecognized invoice status/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Invoice status: Unknown')).toBeInTheDocument();
  });

  it('shows retryable network failures without inventing data', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderApp({
      queryClient,
      fetchImpl: createFetchMock(() => Promise.reject(new TypeError('offline'))),
    });

    expect(await screen.findByText(/Some dashboard data is unavailable/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('₺0,00')).not.toBeInTheDocument();
  });
});
