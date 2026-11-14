import { ApiError, NetworkError, ParseError } from './errors';
import { parseProblemDetails } from './problem-details';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryParameterValue =
  string | number | boolean | null | undefined | readonly (string | number | boolean)[];

export type QueryParameters = Record<string, QueryParameterValue>;

export interface ApiRequestOptions {
  /** Defaults to GET. */
  method?: HttpMethod;
  /** JSON-serializable request body. */
  body?: unknown;
  /** Query parameters; null and undefined values are omitted. */
  query?: QueryParameters;
  headers?: HeadersInit;
  signal?: AbortSignal;
  /**
   * Set to false for anonymous endpoints such as login and registration.
   * Defaults to true.
   */
  auth?: boolean;
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface UnauthorizedContext {
  /** The token that was attached to the rejected request. */
  accessToken: string;
}

export interface ApiClientConfig {
  /** Absolute API base URL, for example http://localhost:8080. */
  baseUrl: string;
  /** Injectable fetch implementation, primarily for tests. */
  fetchImpl?: FetchLike;
  /**
   * Supplies the current access token. Phase 2 connects this to the auth session.
   * The client never persists or logs the token.
   */
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /**
   * Called after a request that carried a bearer token receives HTTP 401.
   * The caller must compare the supplied token with the current session token so a
   * delayed response from an older session cannot invalidate a newer sign-in.
   */
  onUnauthorized?: (context: UnauthorizedContext) => void;
  defaultHeaders?: HeadersInit;
}

export interface ApiClient {
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  get<T>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<T>;
  post<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method'>): Promise<T>;
  put<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'method'>): Promise<T>;
  delete<T = void>(path: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<T>;
}

interface PayloadResult {
  value: unknown;
  parseFailed: boolean;
}

const CORRELATION_HEADER = 'X-Correlation-ID';

/** Creates a typed JSON HTTP client. It performs no retries and no implicit persistence. */
export function createApiClient(config: ApiClientConfig): ApiClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const fetchImpl: FetchLike = config.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));

  async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const method = options.method ?? 'GET';
    const url = buildUrl(baseUrl, path, options.query);
    const headers = new Headers(config.defaultHeaders);

    new Headers(options.headers).forEach((value, key) => {
      headers.set(key, value);
    });

    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }

    if (options.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (!headers.has(CORRELATION_HEADER)) {
      headers.set(CORRELATION_HEADER, createCorrelationId());
    }

    let requestToken: string | null = null;

    if (options.auth !== false && config.getAccessToken) {
      const token = await config.getAccessToken();

      if (token) {
        requestToken = token;
        headers.set('Authorization', `Bearer ${token}`);
      }
    }

    const init: RequestInit = {
      method,
      headers,
      credentials: 'omit',
      signal: options.signal,
    };

    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    let response: Response;

    try {
      response = await fetchImpl(url, init);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      throw new NetworkError(undefined, { cause: error });
    }

    const headerCorrelationId = response.headers.get(CORRELATION_HEADER) ?? undefined;
    const payload = await readPayload(response);

    if (!response.ok) {
      const problem = parseProblemDetails(payload.value);

      if (response.status === 401 && requestToken !== null) {
        config.onUnauthorized?.({ accessToken: requestToken });
      }

      throw new ApiError({
        status: response.status,
        problem,
        correlationId: headerCorrelationId ?? problem?.correlationId,
        retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')),
      });
    }

    if (payload.parseFailed) {
      throw new ParseError(response.status);
    }

    return payload.value as T;
  }

  return {
    request,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
    put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
    delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  };
}

/** Normalizes the base URL and rejects unsafe or relative values. */
export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();

  if (trimmed === '') {
    throw new Error('The API base URL must not be empty.');
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('The API base URL must be an absolute URL, for example http://localhost:8080.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('The API base URL must use the http or https protocol.');
  }

  if (url.username !== '' || url.password !== '') {
    throw new Error('The API base URL must not contain embedded credentials.');
  }

  return trimmed.replace(/\/+$/, '');
}

/** Joins a base URL and path, appending defined query parameters. */
export function buildUrl(baseUrl: string, path: string, query?: QueryParameters): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === null || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        search.append(key, String(item));
      }

      continue;
    }

    search.append(key, String(value));
  }

  const queryString = search.toString();

  return queryString === ''
    ? `${baseUrl}${normalizedPath}`
    : `${baseUrl}${normalizedPath}?${queryString}`;
}

function createCorrelationId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replaceAll('-', '');
  }

  const random = Math.random().toString(36).slice(2);

  return `${random}${Date.now().toString(36)}`.padEnd(32, '0').slice(0, 32);
}

async function readPayload(response: Response): Promise<PayloadResult> {
  if (response.status === 204 || response.status === 205) {
    return { value: undefined, parseFailed: false };
  }

  const text = await response.text();

  if (text === '') {
    return { value: undefined, parseFailed: false };
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (!contentType.includes('json')) {
    return { value: text, parseFailed: false };
  }

  try {
    return { value: JSON.parse(text) as unknown, parseFailed: false };
  } catch {
    return { value: undefined, parseFailed: true };
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds);
  }

  const retryAt = Date.parse(value);

  if (Number.isNaN(retryAt)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}
