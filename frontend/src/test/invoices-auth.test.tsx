import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { invoiceKeys } from '@/features/invoices/api/query-keys';
import type { AuthUser } from '@/features/auth/session/types';

import { invoicePage, invoiceSummary, paidInvoiceSummary, requestPath } from './invoice-fixtures';
import { createFetchMock, jsonResponse, problemResponse, type RecordedRequest } from './http';
import { renderApp, testUser } from './render';

const userB: AuthUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'invoice.reader@example.test',
  roles: ['User'],
};

describe('invoice authentication and cache isolation', () => {
  it('attaches the current in-memory bearer token to invoice reads', async () => {
    const requests: RecordedRequest[] = [];
    renderApp({
      initialEntries: ['/invoices'],
      fetchImpl: createFetchMock((request) => {
        requests.push(request);
        return requestPath(request) === '/api/invoices'
          ? jsonResponse(invoicePage([invoiceSummary]))
          : undefined;
      }),
    });

    await screen.findByRole('link', { name: invoiceSummary.invoiceNumber });
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer test-access-token');
  });

  it('uses global 401 invalidation and clears private invoice cache', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { router } = renderApp({
      initialEntries: ['/invoices'],
      queryClient,
      fetchImpl: createFetchMock((request) =>
        requestPath(request) === '/api/invoices'
          ? problemResponse({ title: 'Unauthorized', status: 401 }, 401)
          : undefined,
      ),
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe('/invoices');
    await waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(0));
  });

  it('removes rendered and cached invoices on logout', async () => {
    const queryClient = new QueryClient();
    const { user } = renderApp({
      initialEntries: ['/invoices'],
      queryClient,
      fetchImpl: createFetchMock((request) =>
        requestPath(request) === '/api/invoices'
          ? jsonResponse(invoicePage([invoiceSummary]))
          : undefined,
      ),
    });

    await screen.findByRole('link', { name: invoiceSummary.invoiceNumber });
    expect(
      queryClient.getQueryData(
        invoiceKeys.list(testUser.id, {
          pageNumber: 1,
          pageSize: 20,
          search: '',
          customerId: '',
          status: '',
          issueDateFrom: '',
          issueDateTo: '',
          sortBy: 'issueDate',
          sortDirection: 'desc',
        }),
      ),
    ).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(invoiceSummary.invoiceNumber)).not.toBeInTheDocument();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('does not reuse account A invoice data after signing in as account B', async () => {
    const queryClient = new QueryClient();
    const tokens: (string | null)[] = [];
    const fetchImpl = createFetchMock((request) => {
      const path = requestPath(request);
      const token = request.headers.get('Authorization');

      if (request.method === 'POST' && path === '/api/auth/login') {
        return jsonResponse({
          accessToken: 'invoice-token-b',
          tokenType: 'Bearer',
          expiresIn: 1_800,
        });
      }
      if (path === '/api/auth/me') return jsonResponse(userB);
      if (path === '/api/invoices') {
        tokens.push(token);
        return token === 'Bearer invoice-token-b'
          ? jsonResponse(invoicePage([paidInvoiceSummary]))
          : jsonResponse(invoicePage([invoiceSummary]));
      }
      return undefined;
    });
    const { user } = renderApp({
      initialEntries: ['/invoices'],
      queryClient,
      fetchImpl,
    });

    await screen.findByRole('link', { name: invoiceSummary.invoiceNumber });
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' });
    await user.type(screen.getByLabelText('E-mail address'), userB.email);
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByRole('link', { name: paidInvoiceSummary.invoiceNumber }),
    ).toBeInTheDocument();
    expect(screen.queryByText(invoiceSummary.invoiceNumber)).not.toBeInTheDocument();
    expect(tokens.at(-1)).toBe('Bearer invoice-token-b');

    for (const query of queryClient.getQueryCache().getAll()) {
      if (query.queryKey[0] === 'invoices') expect(query.queryKey[1]).toBe(userB.id);
    }
  });
});
