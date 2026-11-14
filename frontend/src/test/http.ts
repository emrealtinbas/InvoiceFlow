import type { FetchLike } from '@/lib/api';

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');

  return new Response(JSON.stringify(body), { ...init, headers });
}

export function problemResponse(
  body: unknown,
  status: number,
  headers: HeadersInit = {},
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Content-Type', 'application/problem+json');

  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
  signal: AbortSignal | undefined;
}

export function recordedRequest(input: RequestInfo | URL, init?: RequestInit): RecordedRequest {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  return {
    url,
    method: init?.method ?? 'GET',
    headers: new Headers(init?.headers),
    body: typeof init?.body === 'string' ? init.body : null,
    signal: init?.signal ?? undefined,
  };
}

export type RouteHandler = (request: RecordedRequest) => Response | Promise<Response> | undefined;

/** Minimal fetch router for tests. Unhandled requests fail visibly. */
export function createFetchMock(handler: RouteHandler): FetchLike {
  return async (input, init) => {
    const response = await handler(recordedRequest(input, init));

    if (response === undefined) {
      throw new TypeError(`Unexpected request: ${init?.method ?? 'GET'} ${String(input)}`);
    }

    return response;
  };
}
