import { z } from 'zod';

export interface Environment {
  apiBaseUrl: string;
}

export class EnvironmentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentConfigurationError';
  }
}

const apiBaseUrlSchema = z
  .string()
  .trim()
  .min(1, 'VITE_API_BASE_URL must not be empty.')
  .refine(isHttpUrlWithoutCredentials, {
    message:
      'VITE_API_BASE_URL must be an absolute http(s) URL without embedded credentials, ' +
      'for example http://localhost:8080.',
  });

/**
 * Validates the public Vite environment. Throws a descriptive error so a misconfigured
 * deployment fails visibly instead of issuing requests to an unintended host.
 */
export function parseEnvironment(
  source: Record<string, unknown>,
  runtimeOrigin?: string,
): Environment {
  const rawValue = source.VITE_API_BASE_URL;

  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    throw new EnvironmentConfigurationError(
      'VITE_API_BASE_URL is required. Copy frontend/.env.example to frontend/.env and set ' +
        'the base URL of the InvoiceFlow API.',
    );
  }

  if (rawValue.trim() === 'same-origin') {
    if (runtimeOrigin === undefined) {
      throw new EnvironmentConfigurationError(
        'VITE_API_BASE_URL uses same-origin mode, but no browser origin is available.',
      );
    }

    return parseEnvironment({ VITE_API_BASE_URL: runtimeOrigin });
  }

  const result = apiBaseUrlSchema.safeParse(rawValue);

  if (!result.success) {
    const detail = result.error.issues[0]?.message ?? 'The value is invalid.';

    throw new EnvironmentConfigurationError(`Invalid frontend configuration: ${detail}`);
  }

  return {
    apiBaseUrl: result.data.replace(/\/+$/, ''),
  };
}

let cachedEnvironment: Environment | undefined;

/** Returns the validated environment, parsing it once per browser session. */
export function getEnvironment(): Environment {
  cachedEnvironment ??= parseEnvironment(
    import.meta.env as Record<string, unknown>,
    globalThis.location?.origin,
  );

  return cachedEnvironment;
}

function isHttpUrlWithoutCredentials(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}
