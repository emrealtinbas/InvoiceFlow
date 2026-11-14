import { getFieldErrors, type ProblemDetails } from './problem-details';

export type ApiErrorKind = 'api' | 'network' | 'parse';

const FALLBACK_MESSAGES: Readonly<Record<number, string>> = {
  400: 'The request could not be validated.',
  401: 'Authentication is required or the access token has expired.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested resource was not found.',
  409: 'The request conflicts with the current state of the resource.',
  429: 'Too many requests. Please try again later.',
  500: 'The server could not process the request.',
  503: 'The service is temporarily unavailable.',
};

/** Normalized error for an HTTP response with a non-success status code. */
export class ApiError extends Error {
  readonly kind = 'api' satisfies ApiErrorKind;
  readonly status: number;
  readonly problem: ProblemDetails | null;
  readonly correlationId: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(options: {
    status: number;
    problem: ProblemDetails | null;
    correlationId?: string | undefined;
    retryAfterSeconds?: number | undefined;
  }) {
    const message =
      options.problem?.detail ??
      options.problem?.title ??
      FALLBACK_MESSAGES[options.status] ??
      `The API request failed with HTTP ${options.status}.`;

    super(message);

    this.name = 'ApiError';
    this.status = options.status;
    this.problem = options.problem;
    this.correlationId = options.correlationId;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  get fieldErrors(): Readonly<Record<string, string[]>> {
    return getFieldErrors(this.problem);
  }

  get isValidationError(): boolean {
    return this.status === 400 && Object.keys(this.fieldErrors).length > 0;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}

/** The request never reached the API, or the connection was interrupted. */
export class NetworkError extends Error {
  readonly kind = 'network' satisfies ApiErrorKind;

  constructor(message = 'Unable to reach the InvoiceFlow API.', options?: ErrorOptions) {
    super(message, options);
    this.name = 'NetworkError';
  }
}

/** The API returned a successful status but a body that could not be parsed. */
export class ParseError extends Error {
  readonly kind = 'parse' satisfies ApiErrorKind;
  readonly status: number;

  constructor(status: number, options?: ErrorOptions) {
    super('The API returned a response that could not be parsed.', options);
    this.name = 'ParseError';
    this.status = status;
  }
}

export type ApiClientError = ApiError | NetworkError | ParseError;

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

export function isParseError(error: unknown): error is ParseError {
  return error instanceof ParseError;
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return isApiError(error) || isNetworkError(error) || isParseError(error);
}
