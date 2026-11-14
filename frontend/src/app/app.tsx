import { RouterProvider } from 'react-router-dom';

import { AppErrorBoundary } from '@/app/providers/app-error-boundary';
import { AppProviders } from '@/app/providers/app-providers';
import type { Environment } from '@/lib/config/env';

import { appRouter } from './router/router';

interface AppProps {
  environment: Environment;
}

export function App({ environment }: AppProps) {
  return (
    <AppErrorBoundary>
      <AppProviders environment={environment}>
        <RouterProvider router={appRouter} />
      </AppProviders>
    </AppErrorBoundary>
  );
}
