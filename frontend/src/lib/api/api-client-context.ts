import { createContext, useContext } from 'react';

import type { ApiClient } from './client';

export const ApiClientContext = createContext<ApiClient | null>(null);

/** Returns the configured API client. Feature code must not call fetch directly. */
export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);

  if (client === null) {
    throw new Error('useApiClient must be used inside ApiClientProvider.');
  }

  return client;
}
