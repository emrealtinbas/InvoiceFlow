import { QueryClient } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  acmeCustomer,
  customerPage,
  globexCustomer,
  requestPath,
  requestSearch,
} from './customer-fixtures';
import {
  createFetchMock,
  deferred,
  jsonResponse,
  problemResponse,
  type RecordedRequest,
} from './http';
import { renderApp } from './render';

function listRequest(request: RecordedRequest): URLSearchParams | null {
  if (request.method === 'GET' && requestPath(request) === '/api/customers') {
    return requestSearch(request);
  }

  return null;
}

describe('customer list', () => {
  it('renders customers from the API with server-side list parameters', async () => {
    const requests: RecordedRequest[] = [];
    const fetchImpl = createFetchMock((request) => {
      if (listRequest(request) !== null) {
        requests.push(request);
        return jsonResponse(customerPage([acmeCustomer, globexCustomer]));
      }

      return undefined;
    });

    renderApp({ initialEntries: ['/customers'], fetchImpl });

    expect(await screen.findByRole('heading', { level: 1, name: 'Customers' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Acme Studio' })).toHaveAttribute(
      'href',
      `/customers/${acmeCustomer.id}`,
    );
    expect(screen.getByRole('link', { name: 'Globex Design' })).toBeInTheDocument();
    expect(screen.getByText(acmeCustomer.email ?? '')).toBeInTheDocument();
    expect(screen.getByText(acmeCustomer.phone ?? '')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Customers' })).toBeInTheDocument();
    expect(screen.getByText('Showing 1–2 of 2')).toBeInTheDocument();

    expect(requests).toHaveLength(1);
    const params = requestSearch(requests[0] as RecordedRequest);
    expect(params.get('page')).toBe('1');
    expect(params.get('pageSize')).toBe('20');
    expect(params.get('sortBy')).toBe('name');
    expect(params.get('sortDirection')).toBe('asc');
    expect(params.get('search')).toBeNull();
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer test-access-token');
  });

  it('shows an empty state when the API returns no customers', async () => {
    renderApp({
      initialEntries: ['/customers'],
      fetchImpl: createFetchMock((request) =>
        listRequest(request) === null ? undefined : jsonResponse(customerPage([])),
      ),
    });

    expect(await screen.findByText('No customers yet')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Add customer' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('table', { name: 'Customers' })).not.toBeInTheDocument();
  });

  it('shows a loading state while the list request is pending', async () => {
    const pending = deferred<Response>();

    renderApp({
      initialEntries: ['/customers'],
      fetchImpl: createFetchMock((request) =>
        listRequest(request) === null ? undefined : pending.promise,
      ),
    });

    expect(await screen.findByText('Loading customers…')).toBeInTheDocument();
  });

  it('shows a retryable error state when the list request fails', async () => {
    let calls = 0;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const fetchImpl = createFetchMock((request) => {
      if (listRequest(request) === null) {
        return undefined;
      }

      calls += 1;

      if (calls === 1) {
        return problemResponse(
          {
            title: 'Server error',
            status: 500,
            detail: 'An unexpected error occurred.',
            correlationId: 'list-correlation',
          },
          500,
        );
      }

      return jsonResponse(customerPage([acmeCustomer]));
    });

    const { user } = renderApp({ initialEntries: ['/customers'], fetchImpl, queryClient });

    expect(
      await screen.findByRole('heading', { name: 'Customers could not be loaded' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The customer service is temporarily unavailable. Try again shortly.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Reference: list-correlation')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('link', { name: 'Acme Studio' })).toBeInTheDocument();
    expect(calls).toBe(2);
  });

  it('debounces search, sends it server-side, and resets pagination to page 1', async () => {
    const requests: RecordedRequest[] = [];
    const fetchImpl = createFetchMock((request) => {
      if (listRequest(request) !== null) {
        requests.push(request);
        return jsonResponse(
          customerPage([acmeCustomer], { page: Number(requestSearch(request).get('page')) }),
        );
      }

      return undefined;
    });

    const { user } = renderApp({ initialEntries: ['/customers?page=3'], fetchImpl });

    await screen.findByRole('link', { name: 'Acme Studio' });
    const search = screen.getByLabelText('Search customers');
    expect(search).toHaveValue('');

    await user.type(search, 'acme');

    await waitFor(
      () => {
        const matches = requests.filter(
          (request) => requestSearch(request).get('search') === 'acme',
        );
        expect(matches).toHaveLength(1);
      },
      { timeout: 2_000 },
    );

    const searchRequest = requests.find(
      (request) => requestSearch(request).get('search') === 'acme',
    );
    expect(searchRequest).toBeDefined();
    expect(requestSearch(searchRequest as RecordedRequest).get('page')).toBe('1');
    expect(
      requests.filter((request) => requestSearch(request).get('search') === 'acme'),
    ).toHaveLength(1);
  });

  it('cancels obsolete search requests when the query changes', async () => {
    const slow = deferred<Response>();
    let slowSignal: AbortSignal | undefined;
    let fastSignal: AbortSignal | undefined;
    const fast = deferred<Response>();

    const fetchImpl = createFetchMock((request) => {
      const params = listRequest(request);

      if (params === null) {
        return undefined;
      }

      const search = params.get('search');

      if (search === 'slow') {
        slowSignal = request.signal;

        request.signal?.addEventListener('abort', () => {
          slow.reject(new DOMException('Aborted', 'AbortError'));
        });

        return slow.promise;
      }

      if (search === 'fast') {
        fastSignal = request.signal;
        return fast.promise;
      }

      return jsonResponse(customerPage([acmeCustomer]));
    });

    const { user } = renderApp({ initialEntries: ['/customers?search=slow'], fetchImpl });

    await screen.findByText('Loading customers…');
    await waitFor(() => expect(slowSignal).toBeDefined());

    const search = screen.getByLabelText('Search customers');
    await user.clear(search);
    await user.type(search, 'fast');

    await waitFor(() => expect(fastSignal).toBeDefined(), { timeout: 2_000 });
    await waitFor(() => expect(slowSignal?.aborted).toBe(true));

    fast.resolve(jsonResponse(customerPage([acmeCustomer])));
    expect(await screen.findByRole('link', { name: 'Acme Studio' })).toBeInTheDocument();
  });

  it('sends allow-listed sorting to the API and resets pagination', async () => {
    const requests: RecordedRequest[] = [];
    const fetchImpl = createFetchMock((request) => {
      if (listRequest(request) !== null) {
        requests.push(request);
        return jsonResponse(
          customerPage([acmeCustomer], {
            page: Number(requestSearch(request).get('page')),
            totalCount: 45,
          }),
        );
      }

      return undefined;
    });

    const { user } = renderApp({ initialEntries: ['/customers?page=2'], fetchImpl });

    await screen.findByRole('link', { name: 'Acme Studio' });
    expect(requestSearch(requests[0] as RecordedRequest).get('page')).toBe('2');

    await user.selectOptions(screen.getByLabelText('Sort by'), 'email');

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            requestSearch(request).get('sortBy') === 'email' &&
            requestSearch(request).get('page') === '1',
        ),
      ).toBe(true);
    });

    await user.selectOptions(screen.getByLabelText('Order'), 'desc');

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            requestSearch(request).get('sortBy') === 'email' &&
            requestSearch(request).get('sortDirection') === 'desc' &&
            requestSearch(request).get('page') === '1',
        ),
      ).toBe(true);
    });
  });

  it('paginates on the server and respects the maximum page size', async () => {
    const requests: RecordedRequest[] = [];
    const fetchImpl = createFetchMock((request) => {
      if (listRequest(request) !== null) {
        requests.push(request);
        const params = requestSearch(request);

        return jsonResponse(
          customerPage([acmeCustomer], {
            page: Number(params.get('page')),
            pageSize: Number(params.get('pageSize')),
            totalCount: 45,
            totalPages: Math.ceil(45 / Number(params.get('pageSize'))),
          }),
        );
      }

      return undefined;
    });

    const { user } = renderApp({ initialEntries: ['/customers'], fetchImpl });

    expect(await screen.findByText('Showing 1–20 of 45')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('Showing 21–40 of 45')).toBeInTheDocument();
    expect(requestSearch(requests.at(-1) as RecordedRequest).get('page')).toBe('2');

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Rows per page'), '10');

    await waitFor(() => {
      const params = requestSearch(requests.at(-1) as RecordedRequest);
      expect(params.get('page')).toBe('1');
      expect(params.get('pageSize')).toBe('10');
    });
    expect(await screen.findByText('Page 1 of 5')).toBeInTheDocument();

    const pageSizeOptions = screen.getAllByRole('option').map((option) => option.textContent);
    expect(pageSizeOptions).not.toContain('101');
    expect(screen.getByRole('option', { name: '100' })).toBeInTheDocument();
  });

  it('restores state from the URL and supports browser back navigation', async () => {
    const requests: RecordedRequest[] = [];
    const fetchImpl = createFetchMock((request) => {
      if (listRequest(request) !== null) {
        requests.push(request);
        const params = requestSearch(request);

        return jsonResponse(
          customerPage([acmeCustomer], {
            page: Number(params.get('page')),
            pageSize: Number(params.get('pageSize')),
            totalCount: 45,
            totalPages: 5,
          }),
        );
      }

      return undefined;
    });

    const { router, user } = renderApp({
      initialEntries: [
        '/customers?page=2&pageSize=10&search=acme&sortBy=createdAt&sortDirection=desc',
      ],
      fetchImpl,
    });

    expect(await screen.findByRole('link', { name: 'Acme Studio' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search customers')).toHaveValue('acme');
    expect(screen.getByLabelText('Sort by')).toHaveValue('createdAt');
    expect(screen.getByLabelText('Order')).toHaveValue('desc');
    expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();

    const initialParams = requestSearch(requests[0] as RecordedRequest);
    expect(initialParams.get('page')).toBe('2');
    expect(initialParams.get('pageSize')).toBe('10');
    expect(initialParams.get('search')).toBe('acme');
    expect(initialParams.get('sortBy')).toBe('createdAt');
    expect(initialParams.get('sortDirection')).toBe('desc');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Page 3 of 5')).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get('page')).toBe('3');

    await act(async () => {
      await router.navigate(-1);
    });

    expect(await screen.findByText('Page 2 of 5')).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get('page')).toBe('2');
    expect(screen.getByLabelText('Search customers')).toHaveValue('acme');
  });

  it('normalizes invalid URL parameters before requesting the API', async () => {
    const requests: RecordedRequest[] = [];
    const fetchImpl = createFetchMock((request) => {
      if (listRequest(request) !== null) {
        requests.push(request);
        return jsonResponse(customerPage([acmeCustomer]));
      }

      return undefined;
    });

    const { router } = renderApp({
      initialEntries: [
        '/customers?page=0&pageSize=500&sortBy=nope&sortDirection=sideways&search=%20%20',
      ],
      fetchImpl,
    });

    expect(await screen.findByRole('link', { name: 'Acme Studio' })).toBeInTheDocument();
    const params = requestSearch(requests[0] as RecordedRequest);
    expect(params.get('page')).toBe('1');
    expect(params.get('pageSize')).toBe('20');
    expect(params.get('sortBy')).toBe('name');
    expect(params.get('sortDirection')).toBe('asc');
    expect(params.get('search')).toBeNull();

    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.getByLabelText('Search customers')).toHaveValue('');
  });

  it('keeps the table usable on narrow screens with scrolling and secondary columns', async () => {
    renderApp({
      initialEntries: ['/customers'],
      fetchImpl: createFetchMock((request) =>
        listRequest(request) === null ? undefined : jsonResponse(customerPage([acmeCustomer])),
      ),
    });

    const table = await screen.findByRole('table', { name: 'Customers' });
    expect(table.closest('[data-slot="table-container"]')).toHaveClass('overflow-x-auto');
    expect(screen.getByRole('columnheader', { name: 'Phone' })).toHaveClass(
      'hidden',
      'lg:table-cell',
    );
    expect(screen.getByRole('columnheader', { name: 'Created' })).toHaveClass(
      'hidden',
      'md:table-cell',
    );
  });
});
