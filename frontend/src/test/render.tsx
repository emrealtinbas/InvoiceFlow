import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QueryClient } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

import { AppErrorBoundary } from '@/app/providers/app-error-boundary';
import { AppProviders } from '@/app/providers/app-providers';
import { createQueryClient } from '@/app/providers/query-client';
import { routes } from '@/app/router/routes';
import type { AuthSession, AuthUser } from '@/features/auth/session/types';
import type { FetchLike } from '@/lib/api/client';
import type { Environment } from '@/lib/config/env';

export const testEnvironment: Environment = {
  apiBaseUrl: 'http://localhost:8080',
};

export const testUser: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'alex.morgan@example.test',
  roles: ['User'],
};

export function createTestSession(overrides: Partial<AuthSession> = {}): AuthSession {
  const now = Date.now();

  return {
    accessToken: 'test-access-token',
    user: testUser,
    issuedAt: now,
    expiresAt: now + 25 * 60_000,
    ...overrides,
  };
}

export interface RenderAppOptions {
  initialEntries?: string[];
  /** Defaults to true so existing shell tests start from a verified session. */
  authenticated?: boolean;
  session?: AuthSession;
  fetchImpl?: FetchLike;
  /** Test seam for deterministic retry or cache behaviour. */
  queryClient?: QueryClient;
}

const emptyApiFetch: FetchLike = async (input) => {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
  const isCustomers = url.pathname === '/api/customers';
  const body = isCustomers
    ? { items: [], page: 1, pageSize, totalCount: 0, totalPages: 0 }
    : { items: [], pageNumber: 1, pageSize, totalCount: 0, totalPages: 0 };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

/** Renders the real route tree and providers with an isolated in-memory history. */
export function renderApp(options: string[] | RenderAppOptions = {}) {
  const resolved: RenderAppOptions = Array.isArray(options) ? { initialEntries: options } : options;
  const initialEntries = resolved.initialEntries ?? ['/'];
  const authenticated = resolved.authenticated ?? true;
  const initialSession = authenticated ? (resolved.session ?? createTestSession()) : null;
  const queryClient = resolved.queryClient ?? createQueryClient();
  const router = createMemoryRouter(routes, { initialEntries });
  const user = userEvent.setup();

  const result = render(
    <AppErrorBoundary>
      <AppProviders
        environment={testEnvironment}
        queryClient={queryClient}
        initialSession={initialSession}
        fetchImpl={resolved.fetchImpl ?? emptyApiFetch}
      >
        <RouterProvider router={router} />
      </AppProviders>
    </AppErrorBoundary>,
  );

  return {
    ...result,
    router,
    user,
    queryClient,
  };
}
