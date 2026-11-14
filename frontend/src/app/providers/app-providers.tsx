import { useState, type PropsWithChildren } from 'react';

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';

import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/features/auth/session/auth-provider';
import type { AuthSession } from '@/features/auth/session/types';
import type { FetchLike } from '@/lib/api/client';
import { EnvironmentProvider } from '@/lib/config/environment-provider';
import type { Environment } from '@/lib/config/env';

import { createQueryClient } from './query-client';

interface AppProvidersProps extends PropsWithChildren {
  environment: Environment;
  /** Test seam: allows assertions against a known cache instance. */
  queryClient?: QueryClient;
  /** Test seam: starts the session controller with a known in-memory session. */
  initialSession?: AuthSession | null;
  /** Test seam: injects fetch without replacing the production API client. */
  fetchImpl?: FetchLike;
}

export function AppProviders({
  environment,
  queryClient,
  initialSession,
  fetchImpl,
  children,
}: AppProvidersProps) {
  const [defaultQueryClient] = useState(createQueryClient);
  const activeQueryClient = queryClient ?? defaultQueryClient;

  return (
    <EnvironmentProvider environment={environment}>
      <QueryClientProvider client={activeQueryClient}>
        <AuthProvider
          {...(initialSession !== undefined ? { initialSession } : {})}
          {...(fetchImpl ? { fetchImpl } : {})}
        >
          {children}
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </EnvironmentProvider>
  );
}
