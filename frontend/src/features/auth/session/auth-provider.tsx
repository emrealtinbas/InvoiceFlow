import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { ApiClientProvider, createApiClient, type FetchLike } from '@/lib/api';
import { useEnvironment } from '@/lib/config/environment-context';

import { loadCurrentUser, login, IdentityVerificationError } from '../api/contracts';
import type { LoginRequest } from '../api/types';
import { AuthContext, type AuthContextValue } from './context';
import { calculateSessionExpiry } from './expiry';
import type { AuthSession, AuthState, SessionEndReason } from './types';

interface AuthProviderProps extends PropsWithChildren {
  /** Test seam: starts with a session without performing network requests. */
  initialSession?: AuthSession | null;
  /** Test seam: injects fetch while keeping the real API-client implementation. */
  fetchImpl?: FetchLike;
}

interface SessionStore {
  get: () => AuthSession | null;
  getToken: () => string | null;
  set: (session: AuthSession) => void;
  clear: () => void;
}

function createSessionStore(initialSession: AuthSession | null): SessionStore {
  let session = initialSession;

  return {
    get: () => session,
    getToken: () => session?.accessToken ?? null,
    set: (nextSession) => {
      session = nextSession;
    },
    clear: () => {
      session = null;
    },
  };
}

/**
 * Owns the in-memory authentication session.
 *
 * A monotonic generation token plus the current session token guard every asynchronous
 * transition. A late `/me` response, a late 401, or a second login cannot restore or
 * invalidate a session that has already been replaced or signed out.
 */
export function AuthProvider({ initialSession, fetchImpl, children }: AuthProviderProps) {
  const { apiBaseUrl } = useEnvironment();
  const queryClient = useQueryClient();

  const [state, setState] = useState<AuthState>(() =>
    initialSession
      ? { status: 'authenticated', session: initialSession }
      : { status: 'anonymous', reason: null },
  );
  const [sessionStore] = useState(() => createSessionStore(initialSession ?? null));
  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const invalidateSession = useCallback(
    (reason: SessionEndReason) => {
      generationRef.current += 1;

      const controller = controllerRef.current;
      controllerRef.current = null;
      controller?.abort();

      sessionStore.clear();
      setState((current) =>
        current.status === 'anonymous' && current.reason === reason
          ? current
          : { status: 'anonymous', reason },
      );

      void queryClient.cancelQueries();
      queryClient.clear();
    },
    [queryClient, sessionStore],
  );

  const getAccessToken = useCallback(() => sessionStore.getToken(), [sessionStore]);

  const handleUnauthorized = useCallback(
    ({ accessToken }: { accessToken: string }) => {
      // Only the currently published token may end the current session.
      if (sessionStore.getToken() === accessToken) {
        invalidateSession('unauthorized');
      }
    },
    [invalidateSession, sessionStore],
  );

  const apiClient = useMemo(
    () =>
      // The client invokes these callbacks only while handling async requests, never during
      // render. The ESLint rule cannot see through the stable mutable session holder.
      // eslint-disable-next-line react-hooks/refs
      createApiClient({
        baseUrl: apiBaseUrl,
        getAccessToken,
        onUnauthorized: handleUnauthorized,
        ...(fetchImpl ? { fetchImpl } : {}),
      }),
    [apiBaseUrl, fetchImpl, getAccessToken, handleUnauthorized],
  );

  const signIn = useCallback(
    async (credentials: LoginRequest) => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      // Never expose one account's cached data while another account is authenticating.
      void queryClient.cancelQueries();
      queryClient.clear();
      sessionStore.clear();
      setState({ status: 'authenticating' });

      try {
        const token = await login(apiClient, credentials, controller.signal);
        const issuedAt = Date.now();
        const expiresAt = calculateSessionExpiry(token.expiresIn, issuedAt);
        const user = await loadCurrentUser(apiClient, token.accessToken, controller.signal).catch(
          (error: unknown) => {
            throw new IdentityVerificationError({ cause: error });
          },
        );

        if (generationRef.current !== generation || controller.signal.aborted) {
          return;
        }

        const session: AuthSession = {
          accessToken: token.accessToken,
          user,
          issuedAt,
          expiresAt,
        };

        queryClient.clear();
        sessionStore.set(session);
        setState({ status: 'authenticated', session });
      } catch (error) {
        if (generationRef.current !== generation || controller.signal.aborted) {
          return;
        }

        sessionStore.clear();
        setState({ status: 'anonymous', reason: null });
        throw error;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
      }
    },
    [apiClient, queryClient, sessionStore],
  );

  const signOut = useCallback(() => {
    invalidateSession('signed-out');
  }, [invalidateSession]);

  useEffect(() => {
    if (state.status !== 'authenticated') {
      return;
    }

    const session = state.session;
    const delay = Math.max(0, session.expiresAt - Date.now());
    const timer = setTimeout(() => {
      if (sessionStore.get()?.accessToken === session.accessToken) {
        invalidateSession('expired');
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [state, invalidateSession, sessionStore]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.status === 'authenticated' ? state.session.user : null,
      expiresAt: state.status === 'authenticated' ? state.session.expiresAt : null,
      endReason: state.status === 'anonymous' ? state.reason : null,
      isAuthenticated: state.status === 'authenticated',
      signIn,
      signOut,
    }),
    [state, signIn, signOut],
  );

  return (
    <ApiClientProvider client={apiClient}>
      <AuthContext value={value}>{children}</AuthContext>
    </ApiClientProvider>
  );
}
