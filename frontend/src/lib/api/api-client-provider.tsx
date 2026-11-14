import type { PropsWithChildren } from 'react';

import { ApiClientContext } from './api-client-context';
import type { ApiClient } from './client';

interface ApiClientProviderProps extends PropsWithChildren {
  client: ApiClient;
}

export function ApiClientProvider({ client, children }: ApiClientProviderProps) {
  return <ApiClientContext value={client}>{children}</ApiClientContext>;
}
