import type { PropsWithChildren } from 'react';

import { EnvironmentContext } from './environment-context';
import type { Environment } from './env';

interface EnvironmentProviderProps extends PropsWithChildren {
  environment: Environment;
}

export function EnvironmentProvider({ environment, children }: EnvironmentProviderProps) {
  return <EnvironmentContext value={environment}>{children}</EnvironmentContext>;
}
