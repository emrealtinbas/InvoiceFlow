import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  createFetchMock,
  deferred,
  jsonResponse,
  problemResponse,
  type RecordedRequest,
} from './http';
import { renderApp, testUser } from './render';

const loginPayload = {
  accessToken: 'login-token',
  tokenType: 'Bearer',
  expiresIn: 1_800,
};

function authFetch(requests: RecordedRequest[] = []) {
  return createFetchMock((request) => {
    requests.push(request);

    if (request.url.endsWith('/api/auth/login')) {
      return jsonResponse(loginPayload);
    }

    if (request.url.endsWith('/api/auth/me')) {
      return jsonResponse(testUser);
    }

    if (request.method === 'GET' && new URL(request.url).pathname === '/api/customers') {
      return jsonResponse({
        items: [],
        page: 1,
        pageSize: 20,
        totalCount: 0,
        totalPages: 0,
      });
    }

    return undefined;
  });
}

async function fillAndSubmit(
  user: ReturnType<typeof renderApp>['user'],
  password = 'correct-horse',
) {
  await user.type(screen.getByLabelText('E-mail address'), testUser.email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('login page', () => {
  it('validates required fields and e-mail shape without calling the API', async () => {
    const fetchMock = vi.fn();
    const { user } = renderApp({
      authenticated: false,
      initialEntries: ['/login'],
      fetchImpl: fetchMock,
    });

    await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' });
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your e-mail address.')).toBeInTheDocument();
    expect(await screen.findByText('Enter your password.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('E-mail address'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid e-mail address.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs in, loads identity, and restores the requested protected route', async () => {
    const requests: RecordedRequest[] = [];
    const { router, user } = renderApp({
      authenticated: false,
      initialEntries: ['/customers'],
      fetchImpl: authFetch(requests),
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe('/customers');

    await fillAndSubmit(user);

    expect(await screen.findByRole('heading', { level: 1, name: 'Customers' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/customers');
    expect(await screen.findByText('No customers yet')).toBeInTheDocument();
    expect(screen.getAllByText(testUser.email).length).toBeGreaterThan(0);

    expect(requests).toHaveLength(3);
    expect(requests[0]?.url).toContain('/api/auth/login');
    expect(requests[0]?.headers.get('Authorization')).toBeNull();
    expect(requests[0]?.body).toBe(
      JSON.stringify({ email: testUser.email, password: 'correct-horse' }),
    );
    expect(requests[1]?.url).toContain('/api/auth/me');
    expect(requests[1]?.headers.get('Authorization')).toBe('Bearer login-token');
    expect(new URL(requests[2]?.url ?? '').pathname).toBe('/api/customers');
    expect(requests[2]?.headers.get('Authorization')).toBe('Bearer login-token');
  });

  it('shows a generic invalid-credentials message without retrying', async () => {
    const requests: RecordedRequest[] = [];
    const fetchMock = createFetchMock((request) => {
      requests.push(request);

      if (request.url.endsWith('/api/auth/login')) {
        return problemResponse(
          {
            title: 'Unauthorized',
            status: 401,
            detail: 'Invalid e-mail or password.',
            correlationId: 'login-correlation',
          },
          401,
        );
      }

      return undefined;
    });
    const { router, user } = renderApp({
      authenticated: false,
      initialEntries: ['/login'],
      fetchImpl: fetchMock,
    });

    await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' });
    await fillAndSubmit(user);

    expect(await screen.findByText('E-mail or password is incorrect.')).toBeInTheDocument();
    expect(screen.getByText('Reference: login-correlation')).toBeInTheDocument();
    expect(requests).toHaveLength(1);
    expect(router.state.location.pathname).toBe('/login');
  });

  it('does not establish a session until identity loading succeeds', async () => {
    const meResponse = deferred<Response>();
    const fetchMock = createFetchMock((request) => {
      if (request.url.endsWith('/api/auth/login')) {
        return jsonResponse(loginPayload);
      }

      if (request.url.endsWith('/api/auth/me')) {
        return meResponse.promise;
      }

      return undefined;
    });
    const { router, user } = renderApp({
      authenticated: false,
      initialEntries: ['/dashboard'],
      fetchImpl: fetchMock,
    });

    await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' });
    await fillAndSubmit(user);

    expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled();
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.queryByRole('heading', { level: 1, name: 'Dashboard' })).not.toBeInTheDocument();

    await act(async () => {
      meResponse.resolve(jsonResponse(testUser));
    });

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard');
  });

  it('reports identity verification failures and stays signed out', async () => {
    const fetchMock = createFetchMock((request) => {
      if (request.url.endsWith('/api/auth/login')) {
        return jsonResponse(loginPayload);
      }

      if (request.url.endsWith('/api/auth/me')) {
        return problemResponse({ title: 'Unauthorized', status: 401 }, 401);
      }

      return undefined;
    });
    const { router, user } = renderApp({
      authenticated: false,
      initialEntries: ['/login'],
      fetchImpl: fetchMock,
    });

    await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' });
    await fillAndSubmit(user);

    expect(
      await screen.findByText(
        'Sign-in could not be completed because your account could not be verified. Please try again.',
      ),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('handles rate limiting with the Retry-After hint', async () => {
    const fetchMock = createFetchMock((request) => {
      if (request.url.endsWith('/api/auth/login')) {
        return problemResponse({ title: 'Too Many Requests', status: 429 }, 429, {
          'Retry-After': '30',
        });
      }

      return undefined;
    });
    const { user } = renderApp({
      authenticated: false,
      initialEntries: ['/login'],
      fetchImpl: fetchMock,
    });

    await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' });
    await fillAndSubmit(user);

    expect(
      await screen.findByText('Too many attempts. Try again in 30 seconds.'),
    ).toBeInTheDocument();
  });

  it('handles network failures without exposing exception details', async () => {
    const fetchMock = createFetchMock((request) => {
      if (request.url.endsWith('/api/auth/login')) {
        throw new TypeError('fetch failed');
      }

      return undefined;
    });
    const { user } = renderApp({
      authenticated: false,
      initialEntries: ['/login'],
      fetchImpl: fetchMock,
    });

    await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' });
    await fillAndSubmit(user);

    expect(
      await screen.findByText(
        'Unable to reach the InvoiceFlow API. Check your connection and try again.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/fetch failed/i)).not.toBeInTheDocument();
  });

  it('rejects malformed successful login responses', async () => {
    const fetchMock = createFetchMock((request) => {
      if (request.url.endsWith('/api/auth/login')) {
        return jsonResponse({ accessToken: 'token-without-contract-fields' });
      }

      return undefined;
    });
    const { user } = renderApp({
      authenticated: false,
      initialEntries: ['/login'],
      fetchImpl: fetchMock,
    });

    await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' });
    await fillAndSubmit(user);

    expect(
      await screen.findByText(
        'The authentication service returned an unexpected response. Please try again.',
      ),
    ).toBeInTheDocument();
  });
});
