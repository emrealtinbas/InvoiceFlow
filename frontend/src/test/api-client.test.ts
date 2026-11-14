import { describe, expect, it, vi } from 'vitest';

import {
  ApiError,
  NetworkError,
  ParseError,
  createApiClient,
  normalizeBaseUrl,
  type FetchLike,
} from '@/lib/api';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');

  return new Response(JSON.stringify(body), { ...init, headers });
}

function problemResponse(body: unknown, status: number, headers: HeadersInit = {}): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/problem+json');

  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

describe('createApiClient', () => {
  it('sends typed GET requests with query parameters and a correlation ID', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse({ items: [], totalCount: 0 }));
    const client = createApiClient({
      baseUrl: 'http://localhost:8080/',
      fetchImpl: fetchMock,
    });

    const result = await client.get<{ totalCount: number }>('/api/customers', {
      query: {
        page: 1,
        search: 'acme studio',
        sortDirection: 'asc',
        customerId: undefined,
        tags: ['a', 'b'],
      },
    });

    expect(result).toEqual({ items: [], totalCount: 0 });

    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();

    const [url, init] = call!;
    const headers = new Headers(init?.headers);

    expect(url).toBe(
      'http://localhost:8080/api/customers?page=1&search=acme+studio&sortDirection=asc&tags=a&tags=b',
    );
    expect(init?.method).toBe('GET');
    expect(init?.credentials).toBe('omit');
    expect(headers.get('Accept')).toBe('application/json');
    expect(headers.get('X-Correlation-ID')).toMatch(/^[a-zA-Z0-9]+$/);
    expect(headers.get('Authorization')).toBeNull();
    expect(headers.get('Content-Type')).toBeNull();
  });

  it('serializes JSON bodies and sets the content type', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse({ id: 'created' }, { status: 201 }));
    const client = createApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: fetchMock,
    });

    const result = await client.post<{ id: string }>(
      '/api/customers',
      { name: 'Acme' },
      { auth: false },
    );

    expect(result).toEqual({ id: 'created' });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);

    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ name: 'Acme' }));
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('attaches a bearer token when a token provider is configured', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ id: 'me' }));
    const getAccessToken = vi.fn(async () => 'test-access-token');
    const client = createApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: fetchMock,
      getAccessToken,
    });

    await client.get('/api/auth/me');

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);

    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(headers.get('Authorization')).toBe('Bearer test-access-token');
  });

  it('does not attach a token for anonymous endpoints', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({}));
    const getAccessToken = vi.fn(async () => 'test-access-token');
    const client = createApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: fetchMock,
      getAccessToken,
    });

    await client.post(
      '/api/auth/login',
      { email: 'a@b.test', password: 'secret' },
      { auth: false },
    );

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);

    expect(getAccessToken).not.toHaveBeenCalled();
    expect(headers.get('Authorization')).toBeNull();
  });

  it('preserves a caller-supplied correlation ID', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({}));
    const client = createApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: fetchMock,
    });

    await client.get('/api/invoices', {
      headers: { 'X-Correlation-ID': 'client-correlation-id' },
    });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(new Headers(init?.headers).get('X-Correlation-ID')).toBe('client-correlation-id');
  });

  it('returns undefined for 204 responses', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: fetchMock,
    });

    await expect(client.delete('/api/invoices/1')).resolves.toBeUndefined();
  });

  it('normalizes validation problems and exposes field errors', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      problemResponse(
        {
          type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
          title: 'One or more validation errors occurred.',
          status: 400,
          detail: 'The request could not be validated.',
          instance: '/api/customers',
          traceId: 'body-correlation',
          correlationId: 'body-correlation',
          errors: {
            Email: ['The Email field is not a valid e-mail address.'],
          },
        },
        400,
        { 'X-Correlation-ID': 'header-correlation' },
      ),
    );
    const client = createApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: fetchMock,
    });

    const error = await client
      .post('/api/customers', { name: '' })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);

    if (!(error instanceof ApiError)) {
      throw error;
    }

    expect(error.status).toBe(400);
    expect(error.isValidationError).toBe(true);
    expect(error.isNotFound).toBe(false);
    expect(error.fieldErrors).toEqual({
      Email: ['The Email field is not a valid e-mail address.'],
    });
    expect(error.message).toBe('The request could not be validated.');
    expect(error.correlationId).toBe('header-correlation');
    expect(error.problem?.traceId).toBe('body-correlation');
  });

  it('normalizes ownership-isolation 404 responses', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      problemResponse(
        {
          title: 'Not Found',
          status: 404,
          detail: 'The customer was not found.',
          instance: '/api/customers/1',
          correlationId: 'body-correlation',
        },
        404,
      ),
    );
    const client = createApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: fetchMock,
    });

    const error = await client.get('/api/customers/1').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);

    if (!(error instanceof ApiError)) {
      throw error;
    }

    expect(error.isNotFound).toBe(true);
    expect(error.message).toBe('The customer was not found.');
    expect(error.correlationId).toBe('body-correlation');
  });

  it('parses Retry-After on rate-limited responses', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      problemResponse(
        {
          title: 'Too Many Requests',
          status: 429,
          detail: 'Too many requests. Please try again later.',
        },
        429,
        { 'Retry-After': '30' },
      ),
    );
    const client = createApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: fetchMock,
    });

    const error = await client.post('/api/auth/login', {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);

    if (!(error instanceof ApiError)) {
      throw error;
    }

    expect(error.isRateLimited).toBe(true);
    expect(error.retryAfterSeconds).toBe(30);
  });

  it('keeps non-JSON server errors separate from validation problems', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      new Response('<html>upstream failure</html>', {
        status: 500,
        headers: { 'Content-Type': 'text/html', 'X-Correlation-ID': 'server-correlation' },
      }),
    );
    const client = createApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: fetchMock,
    });

    const error = await client.get('/api/invoices').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);

    if (!(error instanceof ApiError)) {
      throw error;
    }

    expect(error.status).toBe(500);
    expect(error.isServerError).toBe(true);
    expect(error.isValidationError).toBe(false);
    expect(error.problem).toBeNull();
    expect(error.correlationId).toBe('server-correlation');
    expect(error.message).toBe('The server could not process the request.');
  });

  it('throws ParseError for malformed successful JSON', async () => {
    const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
      new Response('{not-json', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: fetchMock,
    });

    await expect(client.get('/api/invoices')).rejects.toBeInstanceOf(ParseError);
  });

  it('normalizes network failures separately from API errors', async () => {
    const fetchMock = vi.fn<FetchLike>().mockRejectedValue(new TypeError('fetch failed'));
    const client = createApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: fetchMock,
    });

    const error = await client.get('/api/invoices').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NetworkError);
    expect(error).not.toBeInstanceOf(ApiError);

    if (!(error instanceof NetworkError)) {
      throw error;
    }

    expect(error.kind).toBe('network');
    expect(error.message).toMatch(/Unable to reach the InvoiceFlow API/);
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it('rethrows abort errors and forwards the AbortSignal', async () => {
    const controller = new AbortController();
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    const fetchMock = vi.fn<FetchLike>().mockRejectedValue(abortError);
    const client = createApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: fetchMock,
    });

    const error = await client
      .get('/api/invoices', { signal: controller.signal })
      .catch((caught: unknown) => caught);

    expect(error).toBe(abortError);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('never retries a failed request internally', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(problemResponse({ title: 'Server Error', status: 500 }, 500));
    const client = createApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: fetchMock,
    });

    await expect(client.post('/api/invoices', {})).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports the token that received an authenticated 401', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(problemResponse({ title: 'Unauthorized', status: 401 }, 401));
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: fetchMock,
      getAccessToken: () => 'current-token',
      onUnauthorized,
    });

    await expect(client.get('/api/customers')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(onUnauthorized).toHaveBeenCalledWith({ accessToken: 'current-token' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not report a 401 from a request without a bearer token', async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValue(problemResponse({ title: 'Unauthorized', status: 401 }, 401));
    const onUnauthorized = vi.fn();
    const client = createApiClient({
      baseUrl: 'http://localhost:8080',
      fetchImpl: fetchMock,
      getAccessToken: () => 'current-token',
      onUnauthorized,
    });

    await expect(
      client.post('/api/auth/login', { email: 'a@b.test', password: 'secret' }, { auth: false }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe('normalizeBaseUrl', () => {
  it('removes trailing slashes', () => {
    expect(normalizeBaseUrl('https://api.example.test///')).toBe('https://api.example.test');
  });

  it('rejects empty, relative, and non-HTTP values', () => {
    expect(() => normalizeBaseUrl(' ')).toThrow(/must not be empty/i);
    expect(() => normalizeBaseUrl('/api')).toThrow(/absolute URL/i);
    expect(() => normalizeBaseUrl('ftp://example.test')).toThrow(/http or https/i);
  });

  it('rejects embedded credentials before an authenticated request can be constructed', () => {
    expect(() => normalizeBaseUrl('https://user:secret@api.example.test')).toThrow(
      /embedded credentials/i,
    );
  });
});
