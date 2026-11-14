import { StrictMode } from 'react';

import { createRoot } from 'react-dom/client';

import { App } from '@/app/app';
import { ConfigurationErrorPage } from '@/app/pages/configuration-error-page';
import { EnvironmentConfigurationError, getEnvironment } from '@/lib/config/env';

import './styles/index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('The application root element is missing from index.html.');
}

try {
  const environment = getEnvironment();

  createRoot(rootElement).render(
    <StrictMode>
      <App environment={environment} />
    </StrictMode>,
  );
} catch (error) {
  const message =
    error instanceof EnvironmentConfigurationError
      ? error.message
      : 'The application could not start. Check the browser console for details.';

  createRoot(rootElement).render(<ConfigurationErrorPage message={message} />);
}
