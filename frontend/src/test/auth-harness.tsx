import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';

import { createQueryClient } from '@/app/providers/query-client';
import { AuthProvider } from '@/features/auth/session/auth-provider';
import { useAuth, type AuthContextValue } from '@/features/auth/session/context';
import type { AuthSession } from '@/features/auth/session/types';
import { useApiClient, type ApiClient, type FetchLike } from '@/lib/api';
import { EnvironmentProvider } from '@/lib/config/environment-provider';

import { testEnvironment } from './render';

interface AuthHarnessOptions {
  initialSession?: AuthSession | null;
  fetchImpl?: FetchLike;
}

/**
 * Renders the real session controller without routes so tests can drive sign-in,
 * sign-out, expiry, and API access deterministically.
 */
export function renderAuthHarness(options: AuthHarnessOptions = {}) {
  const queryClient = createQueryClient();
  const authRef: { current: AuthContextValue | null } = { current: null };
  const apiClientRef: { current: ApiClient | null } = { current: null };

  function Probe() {
    const auth = useAuth();
    const apiClient = useApiClient();
    authRef.current = auth;
    apiClientRef.current = apiClient;

    return (
      <div>
        <span data-testid="auth-status">{auth.status}</span>
        <span data-testid="auth-email">{auth.user?.email ?? ''}</span>
        <span data-testid="auth-reason">{auth.endReason ?? ''}</span>
      </div>
    );
  }

  const result = render(
    <EnvironmentProvider environment={testEnvironment}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider
          {...(options.initialSession !== undefined
            ? { initialSession: options.initialSession }
            : {})}
          {...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})}
        >
          <Probe />
        </AuthProvider>
      </QueryClientProvider>
    </EnvironmentProvider>,
  );

  function auth(): AuthContextValue {
    if (authRef.current === null) {
      throw new Error('The auth harness has not rendered yet.');
    }

    return authRef.current;
  }

  function apiClient(): ApiClient {
    if (apiClientRef.current === null) {
      throw new Error('The API client has not rendered yet.');
    }

    return apiClientRef.current;
  }

  return { ...result, queryClient, auth, apiClient };
}
