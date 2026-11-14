import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { AuthUser } from '@/features/auth/session/types';
import { createQueryClient } from '@/app/providers/query-client';

import { acmeCustomer, customerPage, globexCustomer, requestPath } from './customer-fixtures';
import { createFetchMock, jsonResponse, problemResponse, type RecordedRequest } from './http';
import { renderApp, testUser } from './render';

const userB: AuthUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'blair.chen@example.test',
  roles: ['User'],
};

describe('customer authentication and cache isolation', () => {
  it('attaches the in-memory bearer token to customer requests', async () => {
    const requests: RecordedRequest[] = [];
    const fetchImpl = createFetchMock((request) => {
      requests.push(request);

      if (request.method === 'GET' && requestPath(request) === '/api/customers') {
        return jsonResponse(customerPage([acmeCustomer]));
      }

      return undefined;
    });

    renderApp({ initialEntries: ['/customers'], fetchImpl });

    expect(await screen.findByRole('link', { name: acmeCustomer.name })).toBeInTheDocument();
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer test-access-token');
  });

  it('clears the session and cache when a customer request returns 401', async () => {
    const queryClient = createQueryClient();
    const fetchImpl = createFetchMock((request) => {
      if (request.method === 'GET' && requestPath(request) === '/api/customers') {
        return problemResponse({ title: 'Unauthorized', status: 401 }, 401);
      }

      return undefined;
    });

    const { router } = renderApp({
      initialEntries: ['/customers'],
      fetchImpl,
      queryClient,
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your session is no longer valid. Sign in again to continue.'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe('/customers');
    await waitFor(() => expect(queryClient.getQueryCache().getAll()).toHaveLength(0));
  });

  it('clears customer data from the UI and cache on sign-out', async () => {
    const queryClient = createQueryClient();
    const fetchImpl = createFetchMock((request) => {
      if (request.method === 'GET' && requestPath(request) === '/api/customers') {
        return jsonResponse(customerPage([acmeCustomer]));
      }

      return undefined;
    });

    const { user } = renderApp({ initialEntries: ['/customers'], fetchImpl, queryClient });

    expect(await screen.findByRole('link', { name: acmeCustomer.name })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(acmeCustomer.name)).not.toBeInTheDocument();
    expect(
      screen.getByText('You have signed out. Sign in again when you are ready.'),
    ).toBeInTheDocument();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('does not leak the previous account customers after an account switch', async () => {
    const queryClient = createQueryClient();
    const customerTokens: (string | null)[] = [];
    const fetchImpl = createFetchMock((request) => {
      const path = requestPath(request);
      const token = request.headers.get('Authorization');

      if (request.method === 'POST' && path === '/api/auth/login') {
        return jsonResponse({ accessToken: 'token-b', tokenType: 'Bearer', expiresIn: 1_800 });
      }

      if (request.method === 'GET' && path === '/api/auth/me') {
        return token === 'Bearer token-b' ? jsonResponse(userB) : jsonResponse(testUser);
      }

      if (request.method === 'GET' && path === '/api/customers') {
        customerTokens.push(token);

        return token === 'Bearer token-b'
          ? jsonResponse(customerPage([globexCustomer]))
          : jsonResponse(customerPage([acmeCustomer]));
      }

      return undefined;
    });

    const { user } = renderApp({ initialEntries: ['/customers'], fetchImpl, queryClient });

    expect(await screen.findByRole('link', { name: acmeCustomer.name })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' });

    await user.type(screen.getByLabelText('E-mail address'), userB.email);
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    // Signing out from /customers preserves returnTo, so signing in returns to the list.
    expect(await screen.findByRole('heading', { level: 1, name: 'Customers' })).toBeInTheDocument();

    expect(await screen.findByRole('link', { name: globexCustomer.name })).toBeInTheDocument();
    expect(screen.queryByText(acmeCustomer.name)).not.toBeInTheDocument();
    expect(customerTokens.at(-1)).toBe('Bearer token-b');

    const customerQueries = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => query.queryKey[0] === 'customers');
    expect(customerQueries.length).toBeGreaterThan(0);

    for (const query of customerQueries) {
      expect(query.queryKey[1]).toBe(userB.id);
    }
  });
});
