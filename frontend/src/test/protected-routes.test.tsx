import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createFetchMock, jsonResponse } from './http';
import { renderApp, testUser } from './render';

function successfulAuthFetch() {
  return createFetchMock((request) => {
    if (request.url.endsWith('/api/auth/login')) {
      return jsonResponse({
        accessToken: 'login-token',
        tokenType: 'Bearer',
        expiresIn: 1_800,
      });
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

async function signIn(user: ReturnType<typeof renderApp>['user']) {
  await user.type(screen.getByLabelText('E-mail address'), testUser.email);
  await user.type(screen.getByLabelText('Password'), 'correct-horse');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('protected routes', () => {
  it.each(['/dashboard', '/customers', '/invoices'])(
    'redirects an anonymous visit to %s to login',
    async (path) => {
      const { router } = renderApp({ authenticated: false, initialEntries: [path] });

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/login');
      expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe(path);
      expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
    },
  );

  it('preserves the full internal path and query after login', async () => {
    const { router, user } = renderApp({
      authenticated: false,
      initialEntries: ['/customers?page=2&search=acme'],
      fetchImpl: successfulAuthFetch(),
    });

    await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' });
    expect(new URLSearchParams(router.state.location.search).get('returnTo')).toBe(
      '/customers?page=2&search=acme',
    );

    await signIn(user);

    expect(await screen.findByRole('heading', { level: 1, name: 'Customers' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/customers');
    expect(router.state.location.search).toBe('?page=2&search=acme');
  });

  it('rejects an external return path and falls back to the dashboard', async () => {
    const { router } = renderApp({
      initialEntries: ['/login?returnTo=https%3A%2F%2Fevil.example%2Fsteal'],
    });

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard');
  });

  it.each(['//evil.example/path', '/\\evil.example', '/login', '/register', 'javascript:alert(1)'])(
    'rejects unsafe return path %s',
    async (returnTo) => {
      const { router } = renderApp({
        initialEntries: [`/login?returnTo=${encodeURIComponent(returnTo)}`],
      });

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Dashboard' }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe('/dashboard');
    },
  );

  it('redirects authenticated users away from login and registration', async () => {
    const login = renderApp({ initialEntries: ['/login'] });

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(login.router.state.location.pathname).toBe('/dashboard');
    login.unmount();

    const register = renderApp({ initialEntries: ['/register'] });

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(register.router.state.location.pathname).toBe('/dashboard');
  });

  it('redirects an anonymous unknown route to login while preserving not-found for signed-in users', async () => {
    const anonymous = renderApp({ authenticated: false, initialEntries: ['/unknown-page'] });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' }),
    ).toBeInTheDocument();
    expect(new URLSearchParams(anonymous.router.state.location.search).get('returnTo')).toBe(
      '/unknown-page',
    );
    anonymous.unmount();

    const authenticated = renderApp({ initialEntries: ['/unknown-page'] });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(authenticated.router.state.location.pathname).toBe('/unknown-page');
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });
});
