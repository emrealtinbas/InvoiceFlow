import { QueryClient } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  customerId,
  invoicePage,
  invoiceSummary,
  paidInvoiceSummary,
  requestPath,
  requestSearch,
} from './invoice-fixtures';
import {
  createFetchMock,
  deferred,
  jsonResponse,
  problemResponse,
  type RecordedRequest,
} from './http';
import { renderApp } from './render';

function invoiceListParams(request: RecordedRequest): URLSearchParams | null {
  return request.method === 'GET' && requestPath(request) === '/api/invoices'
    ? requestSearch(request)
    : null;
}

describe('invoice list', () => {
  it('renders API summaries and sends the exact invoice pagination defaults', async () => {
    const requests: RecordedRequest[] = [];
    renderApp({
      initialEntries: ['/invoices'],
      fetchImpl: createFetchMock((request) => {
        if (invoiceListParams(request) === null) return undefined;
        requests.push(request);
        return jsonResponse(invoicePage([invoiceSummary, paidInvoiceSummary]));
      }),
    });

    expect(await screen.findByRole('link', { name: invoiceSummary.invoiceNumber })).toHaveAttribute(
      'href',
      `/invoices/${invoiceSummary.id}`,
    );
    expect(screen.getByRole('link', { name: customerId })).toHaveAttribute(
      'href',
      `/customers/${customerId}`,
    );
    expect(screen.getByRole('table', { name: 'Invoices' })).toBeInTheDocument();
    expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument();

    const params = requestSearch(requests[0] as RecordedRequest);
    expect(params.get('pageNumber')).toBe('1');
    expect(params.get('page')).toBeNull();
    expect(params.get('pageSize')).toBe('20');
    expect(params.get('sortBy')).toBe('issueDate');
    expect(params.get('sortDirection')).toBe('desc');
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer test-access-token');
  });

  it('announces the initial loading state', async () => {
    const pending = deferred<Response>();
    renderApp({
      initialEntries: ['/invoices'],
      fetchImpl: createFetchMock((request) =>
        invoiceListParams(request) === null ? undefined : pending.promise,
      ),
    });

    expect(await screen.findByText('Loading invoices…')).toBeInTheDocument();
  });

  it('shows an empty state without introducing create actions', async () => {
    renderApp({
      initialEntries: ['/invoices'],
      fetchImpl: createFetchMock((request) =>
        invoiceListParams(request) === null ? undefined : jsonResponse(invoicePage([])),
      ),
    });

    expect(await screen.findByText('No invoices yet')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Invoices' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create invoice/i })).not.toBeInTheDocument();
  });

  it('distinguishes filtered no-results and clears all filters', async () => {
    const { user, router } = renderApp({
      initialEntries: ['/invoices?status=Paid&search=missing'],
      fetchImpl: createFetchMock((request) =>
        invoiceListParams(request) === null ? undefined : jsonResponse(invoicePage([])),
      ),
    });

    expect(await screen.findByText('No matching invoices')).toBeInTheDocument();
    const clearButtons = screen.getAllByRole('button', { name: 'Clear filters' });
    await user.click(clearButtons.at(-1) as HTMLButtonElement);

    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.getByLabelText('Status')).toHaveValue('');
    expect(screen.getByLabelText('Search invoice number')).toHaveValue('');
  });

  it('shows a network failure without exposing internal details', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderApp({
      initialEntries: ['/invoices'],
      queryClient,
      fetchImpl: createFetchMock((request) =>
        invoiceListParams(request) === null
          ? undefined
          : Promise.reject(new TypeError('socket details must stay private')),
      ),
    });

    expect(await screen.findByText('Invoices could not be loaded')).toBeInTheDocument();
    expect(
      screen.getByText('Unable to reach the InvoiceFlow API. Check your connection and try again.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/socket details/)).not.toBeInTheDocument();
  });

  it('recovers from an API error through the retry action', async () => {
    let calls = 0;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { user } = renderApp({
      initialEntries: ['/invoices'],
      queryClient,
      fetchImpl: createFetchMock((request) => {
        if (invoiceListParams(request) === null) return undefined;
        calls += 1;
        return calls === 1
          ? problemResponse(
              {
                title: 'Server error',
                status: 500,
                correlationId: 'invoice-list-reference',
              },
              500,
            )
          : jsonResponse(invoicePage([invoiceSummary]));
      }),
    });

    expect(await screen.findByText('Reference: invoice-list-reference')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('link', { name: invoiceSummary.invoiceNumber }),
    ).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('paginates on the server with pageNumber and resets page for page-size changes', async () => {
    const requests: RecordedRequest[] = [];
    const { user } = renderApp({
      initialEntries: ['/invoices'],
      fetchImpl: createFetchMock((request) => {
        const params = invoiceListParams(request);
        if (params === null) return undefined;
        requests.push(request);
        const pageNumber = Number(params.get('pageNumber'));
        const pageSize = Number(params.get('pageSize'));
        return jsonResponse(
          invoicePage([invoiceSummary], {
            pageNumber,
            pageSize,
            totalCount: 45,
            totalPages: Math.ceil(45 / pageSize),
          }),
        );
      }),
    });

    expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
    expect(requestSearch(requests.at(-1) as RecordedRequest).get('pageNumber')).toBe('2');

    await user.selectOptions(screen.getByLabelText('Rows per page'), '10');
    await waitFor(() => {
      const params = requestSearch(requests.at(-1) as RecordedRequest);
      expect(params.get('pageNumber')).toBe('1');
      expect(params.get('pageSize')).toBe('10');
    });
  });

  it('sends only supported server filters and debounced invoice-number search', async () => {
    const requests: RecordedRequest[] = [];
    const { user } = renderApp({
      initialEntries: ['/invoices'],
      fetchImpl: createFetchMock((request) => {
        if (invoiceListParams(request) === null) return undefined;
        requests.push(request);
        return jsonResponse(invoicePage([invoiceSummary]));
      }),
    });

    await screen.findByRole('link', { name: invoiceSummary.invoiceNumber });
    await user.selectOptions(screen.getByLabelText('Status'), 'Draft');
    await user.type(screen.getByLabelText('Search invoice number'), '000001');
    await user.type(screen.getByLabelText('Issued from'), '2026-11-01');
    await user.type(screen.getByLabelText('Issued to'), '2026-11-30');
    await user.type(screen.getByLabelText('Customer identifier'), customerId);
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(
      () => {
        expect(requests.some((request) => requestSearch(request).get('search') === '000001')).toBe(
          true,
        );
      },
      { timeout: 2_000 },
    );

    const matching = requests.find((request) => {
      const params = requestSearch(request);
      return (
        params.get('search') === '000001' &&
        params.get('status') === 'Draft' &&
        params.get('customerId') === customerId &&
        params.get('issueDateFrom') === '2026-11-01' &&
        params.get('issueDateTo') === '2026-11-30'
      );
    });
    expect(matching).toBeDefined();
    const params = requestSearch(matching as RecordedRequest);
    expect(params.get('dueDateFrom')).toBeNull();
    expect(params.get('dueDateTo')).toBeNull();
    expect(params.get('pageNumber')).toBe('1');
  });

  it('rejects an invalid customer identifier without sending it', async () => {
    const requests: RecordedRequest[] = [];
    const { user } = renderApp({
      initialEntries: ['/invoices'],
      fetchImpl: createFetchMock((request) => {
        if (invoiceListParams(request) === null) return undefined;
        requests.push(request);
        return jsonResponse(invoicePage([invoiceSummary]));
      }),
    });

    await screen.findByRole('link', { name: invoiceSummary.invoiceNumber });
    await user.type(screen.getByLabelText('Customer identifier'), 'not-a-guid');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('Enter a valid customer identifier.')).toBeInTheDocument();
    expect(requests.some((request) => requestSearch(request).has('customerId'))).toBe(false);
  });

  it('uses only allow-listed server sorting and resets pagination', async () => {
    const requests: RecordedRequest[] = [];
    const { user } = renderApp({
      initialEntries: ['/invoices?pageNumber=2'],
      fetchImpl: createFetchMock((request) => {
        const params = invoiceListParams(request);
        if (params === null) return undefined;
        requests.push(request);
        return jsonResponse(
          invoicePage([invoiceSummary], {
            pageNumber: Number(params.get('pageNumber')),
            totalCount: 40,
            totalPages: 2,
          }),
        );
      }),
    });

    await screen.findByRole('link', { name: invoiceSummary.invoiceNumber });
    await user.selectOptions(screen.getByLabelText('Sort by'), 'grandTotal');
    await user.selectOptions(screen.getByLabelText('Order'), 'asc');

    await waitFor(() => {
      expect(
        requests.some((request) => {
          const params = requestSearch(request);
          return (
            params.get('sortBy') === 'grandTotal' &&
            params.get('sortDirection') === 'asc' &&
            params.get('pageNumber') === '1'
          );
        }),
      ).toBe(true);
    });
  });

  it('normalizes invalid and unsupported URL parameters before API use', async () => {
    const requests: RecordedRequest[] = [];
    const { router } = renderApp({
      initialEntries: [
        '/invoices?pageNumber=0&pageSize=101&status=Overdue&sortBy=ownerId&sortDirection=sideways&dueDateFrom=2026-01-01&issueDateFrom=bad',
      ],
      fetchImpl: createFetchMock((request) => {
        if (invoiceListParams(request) === null) return undefined;
        requests.push(request);
        return jsonResponse(invoicePage([invoiceSummary]));
      }),
    });

    await screen.findByRole('link', { name: invoiceSummary.invoiceNumber });
    const params = requestSearch(requests[0] as RecordedRequest);
    expect(params.get('pageNumber')).toBe('1');
    expect(params.get('pageSize')).toBe('20');
    expect(params.get('sortBy')).toBe('issueDate');
    expect(params.get('sortDirection')).toBe('desc');
    expect(params.has('status')).toBe(false);
    expect(params.has('dueDateFrom')).toBe(false);
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('restores URL state through browser back navigation', async () => {
    const { router, user } = renderApp({
      initialEntries: ['/invoices?status=Paid&pageNumber=2'],
      fetchImpl: createFetchMock((request) => {
        const params = invoiceListParams(request);
        if (params === null) return undefined;
        return jsonResponse(
          invoicePage([paidInvoiceSummary], {
            pageNumber: Number(params.get('pageNumber')),
            totalCount: 60,
            totalPages: 3,
          }),
        );
      }),
    });

    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toHaveValue('Paid');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument();

    await act(async () => {
      await router.navigate(-1);
    });

    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toHaveValue('Paid');
  });

  it('cancels an obsolete list request when URL-driven search changes', async () => {
    const slow = deferred<Response>();
    let slowSignal: AbortSignal | undefined;
    const { user } = renderApp({
      initialEntries: ['/invoices?search=slow'],
      fetchImpl: createFetchMock((request) => {
        const params = invoiceListParams(request);
        if (params === null) return undefined;

        if (params.get('search') === 'slow') {
          slowSignal = request.signal;
          request.signal?.addEventListener('abort', () =>
            slow.reject(new DOMException('Aborted', 'AbortError')),
          );
          return slow.promise;
        }

        return jsonResponse(invoicePage([invoiceSummary]));
      }),
    });

    await screen.findByText('Loading invoices…');
    await user.clear(screen.getByLabelText('Search invoice number'));
    await user.type(screen.getByLabelText('Search invoice number'), 'fast');

    await waitFor(() => expect(slowSignal?.aborted).toBe(true), { timeout: 2_000 });
    expect(
      await screen.findByRole('link', { name: invoiceSummary.invoiceNumber }),
    ).toBeInTheDocument();
  });

  it('keeps the table scrollable and filter controls keyboard accessible', async () => {
    const { user } = renderApp({
      initialEntries: ['/invoices'],
      fetchImpl: createFetchMock((request) =>
        invoiceListParams(request) === null
          ? undefined
          : jsonResponse(invoicePage([invoiceSummary])),
      ),
    });

    const table = await screen.findByRole('table', { name: 'Invoices' });
    expect(table.closest('[data-slot="table-container"]')).toHaveClass('overflow-x-auto');
    expect(screen.getByRole('columnheader', { name: 'Due date' })).toHaveClass(
      'hidden',
      'md:table-cell',
    );

    await user.tab();
    expect(document.activeElement).not.toBe(document.body);
    screen.getByLabelText('Search invoice number').focus();
    await user.tab();
    expect(document.activeElement).not.toBe(document.body);
  });
});
