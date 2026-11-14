import { createContext, useContext } from 'react';

import type { Environment } from './env';

export const EnvironmentContext = createContext<Environment | null>(null);

/** Reads validated, public frontend configuration. */
export function useEnvironment(): Environment {
  const environment = useContext(EnvironmentContext);

  if (environment === null) {
    throw new Error('useEnvironment must be used inside EnvironmentProvider.');
  }

  return environment;
}
