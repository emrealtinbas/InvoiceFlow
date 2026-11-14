import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import type { AuthUser } from '@/features/auth/session/types';

import { renderAuthHarness } from './auth-harness';
import {
  createFetchMock,
  deferred,
  jsonResponse,
  problemResponse,
  type RecordedRequest,
} from './http';
import { createTestSession, testUser } from './render';

const credentials = { email: testUser.email, password: 'correct-horse' };

const userB: AuthUser = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'blair.chen@example.test',
  roles: ['User'],
};

function tokenPayload(accessToken: string) {
  return { accessToken, tokenType: 'Bearer', expiresIn: 1_800 };
}

function sessionFetch(requests: RecordedRequest[] = []) {
  return createFetchMock((request) => {
    requests.push(request);

    if (request.url.endsWith('/api/auth/login')) {
      return jsonResponse(tokenPayload('token-b'));
    }

    if (request.url.endsWith('/api/auth/me')) {
      return request.headers.get('Authorization') === 'Bearer token-b'
        ? jsonResponse(userB)
        : jsonResponse(testUser);
    }

    return undefined;
  });
}

describe('auth session controller', () => {
  it('publishes identity only after login and /me both succeed', async () => {
    const requests: RecordedRequest[] = [];
    const harness = renderAuthHarness({ fetchImpl: sessionFetch(requests) });

    expect(harness.auth().status).toBe('anonymous');

    await act(async () => {
      await harness.auth().signIn(credentials);
    });

    expect(harness.auth().status).toBe('authenticated');
    expect(harness.auth().user).toEqual(userB);
    expect(harness.auth().endReason).toBeNull();
    expect(screen.getByTestId('auth-email')).toHaveTextContent(userB.email);
    expect(requests.map((request) => request.url)).toEqual([
      'http://localhost:8080/api/auth/login',
      'http://localhost:8080/api/auth/me',
    ]);
  });

  it('attaches the current bearer token to authenticated requests', async () => {
    const requests: RecordedRequest[] = [];
    const harness = renderAuthHarness({
      initialSession: createTestSession(),
      fetchImpl: createFetchMock((request) => {
        requests.push(request);
        return jsonResponse({ items: [], totalCount: 0 });
      }),
    });

    await act(async () => {
      await harness.apiClient().get('/api/customers');
    });

    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer test-access-token');
  });

  it('signs out immediately, clears identity, and clears the query cache', async () => {
    const harness = renderAuthHarness({ initialSession: createTestSession() });
    harness.queryClient.setQueryData(['customers', testUser.id], ['private-customer']);

    act(() => {
      harness.auth().signOut();
    });

    expect(harness.auth().status).toBe('anonymous');
    expect(harness.auth().user).toBeNull();
    expect(harness.auth().endReason).toBe('signed-out');
    expect(harness.queryClient.getQueryData(['customers', testUser.id])).toBeUndefined();
    expect(harness.queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('expires the session at the conservative local deadline', async () => {
    vi.useFakeTimers();
    const harness = renderAuthHarness({
      initialSession: createTestSession({ expiresAt: Date.now() + 5_000 }),
    });
    harness.queryClient.setQueryData(['invoices', testUser.id], ['private-invoice']);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });

    expect(harness.auth().status).toBe('anonymous');
    expect(harness.auth().endReason).toBe('expired');
    expect(harness.auth().user).toBeNull();
    expect(harness.queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('invalidates the session once on a genuine authenticated 401', async () => {
    const harness = renderAuthHarness({
      initialSession: createTestSession(),
      fetchImpl: createFetchMock(() =>
        problemResponse({ title: 'Unauthorized', status: 401 }, 401),
      ),
    });
    harness.queryClient.setQueryData(['customers', testUser.id], ['private-customer']);

    await act(async () => {
      await harness
        .apiClient()
        .get('/api/customers')
        .catch(() => undefined);
    });

    expect(harness.auth().status).toBe('anonymous');
    expect(harness.auth().endReason).toBe('unauthorized');
    expect(harness.queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('ignores a late /me response after sign-out', async () => {
    const meResponse = deferred<Response>();
    const harness = renderAuthHarness({
      fetchImpl: createFetchMock((request) => {
        if (request.url.endsWith('/api/auth/login')) {
          return jsonResponse(tokenPayload('token-a'));
        }

        if (request.url.endsWith('/api/auth/me')) {
          return meResponse.promise;
        }

        return undefined;
      }),
    });

    let signInPromise: Promise<void> | undefined;

    act(() => {
      signInPromise = harness.auth().signIn(credentials);
    });

    await waitFor(() => expect(harness.auth().status).toBe('authenticating'));
    act(() => {
      harness.auth().signOut();
    });

    await act(async () => {
      meResponse.resolve(jsonResponse(testUser));
      await signInPromise;
    });

    expect(harness.auth().status).toBe('anonymous');
    expect(harness.auth().endReason).toBe('signed-out');
    expect(harness.auth().user).toBeNull();
    expect(screen.getByTestId('auth-email')).toHaveTextContent('');
  });

  it('does not let a stale 401 invalidate a newer session', async () => {
    const customersResponse = deferred<Response>();
    const harness = renderAuthHarness({
      initialSession: createTestSession(),
      fetchImpl: createFetchMock((request) => {
        if (request.url.endsWith('/api/customers')) {
          return customersResponse.promise;
        }

        if (request.url.endsWith('/api/auth/login')) {
          return jsonResponse(tokenPayload('token-b'));
        }

        if (request.url.endsWith('/api/auth/me')) {
          return jsonResponse(userB);
        }

        return undefined;
      }),
    });

    let staleRequest: Promise<unknown> | undefined;

    act(() => {
      staleRequest = harness.apiClient().get('/api/customers');
    });

    act(() => {
      harness.auth().signOut();
    });

    await act(async () => {
      await harness.auth().signIn({ email: userB.email, password: 'correct-horse' });
    });

    expect(harness.auth().status).toBe('authenticated');
    expect(harness.auth().user).toEqual(userB);

    await act(async () => {
      customersResponse.resolve(problemResponse({ title: 'Unauthorized', status: 401 }, 401));
      await staleRequest?.catch(() => undefined);
    });

    expect(harness.auth().status).toBe('authenticated');
    expect(harness.auth().user).toEqual(userB);
    expect(harness.auth().endReason).toBeNull();
  });

  it('clears one account’s cache before another account signs in', async () => {
    const harness = renderAuthHarness({
      initialSession: createTestSession(),
      fetchImpl: sessionFetch(),
    });
    harness.queryClient.setQueryData(['customers', testUser.id], ['account-a-data']);
    harness.queryClient.setQueryData(['invoices', testUser.id], ['account-a-invoice']);

    await act(async () => {
      await harness.auth().signIn({ email: userB.email, password: 'correct-horse' });
    });

    expect(harness.auth().user).toEqual(userB);
    expect(harness.queryClient.getQueryData(['customers', testUser.id])).toBeUndefined();
    expect(harness.queryClient.getQueryData(['invoices', testUser.id])).toBeUndefined();
    expect(harness.queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('does not let a late query response repopulate another account’s cache', async () => {
    const pendingData = deferred<string[]>();
    const harness = renderAuthHarness({
      initialSession: createTestSession(),
      fetchImpl: sessionFetch(),
    });
    const staleKey = ['customers', testUser.id] as const;

    const staleQuery = harness.queryClient
      .fetchQuery({
        queryKey: staleKey,
        queryFn: () => pendingData.promise,
      })
      .catch(() => undefined);

    act(() => {
      harness.auth().signOut();
    });

    await act(async () => {
      await harness.auth().signIn({ email: userB.email, password: 'correct-horse' });
    });

    pendingData.resolve(['account-a-secret']);

    await act(async () => {
      await staleQuery;
    });

    expect(harness.queryClient.getQueryData(staleKey)).toBeUndefined();
    expect(harness.queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('does not let an older login overwrite a newer successful login', async () => {
    const firstMe = deferred<Response>();
    let loginCount = 0;
    const harness = renderAuthHarness({
      fetchImpl: createFetchMock((request) => {
        if (request.url.endsWith('/api/auth/login')) {
          loginCount += 1;
          return jsonResponse(tokenPayload(loginCount === 1 ? 'token-a' : 'token-b'));
        }

        if (request.url.endsWith('/api/auth/me')) {
          return request.headers.get('Authorization') === 'Bearer token-a'
            ? firstMe.promise
            : jsonResponse(userB);
        }

        return undefined;
      }),
    });

    let firstSignIn: Promise<void> | undefined;

    act(() => {
      firstSignIn = harness.auth().signIn({ email: testUser.email, password: 'first-password' });
    });

    await waitFor(() => expect(harness.auth().status).toBe('authenticating'));

    await act(async () => {
      await harness.auth().signIn({ email: userB.email, password: 'second-password' });
    });

    expect(harness.auth().status).toBe('authenticated');
    expect(harness.auth().user).toEqual(userB);

    await act(async () => {
      firstMe.resolve(jsonResponse(testUser));
      await firstSignIn;
    });

    expect(harness.auth().status).toBe('authenticated');
    expect(harness.auth().user).toEqual(userB);
  });

  it('does not emit duplicate /me requests during one login', async () => {
    const requests: RecordedRequest[] = [];
    const harness = renderAuthHarness({ fetchImpl: sessionFetch(requests) });

    await act(async () => {
      await harness.auth().signIn(credentials);
    });

    expect(requests.filter((request) => request.url.endsWith('/api/auth/me'))).toHaveLength(1);
  });

  it('does not retry a failed login automatically', async () => {
    const requests: RecordedRequest[] = [];
    const harness = renderAuthHarness({
      fetchImpl: createFetchMock((request) => {
        requests.push(request);
        return problemResponse({ title: 'Unauthorized', status: 401 }, 401);
      }),
    });

    await act(async () => {
      await expect(harness.auth().signIn(credentials)).rejects.toBeInstanceOf(ApiError);
    });

    expect(requests).toHaveLength(1);
    expect(harness.auth().status).toBe('anonymous');
    expect(harness.auth().endReason).toBeNull();
  });
});
