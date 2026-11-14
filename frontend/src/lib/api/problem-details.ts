/**
 * RFC 9457 ProblemDetails as produced by the InvoiceFlow API.
 *
 * The API adds two extensions to every error response:
 * - `traceId` / `correlationId`: the request correlation identifier (currently the same value).
 * - `errors`: present only on validation failures, keyed by the server-side field name
 *   (for example `Email`, `Items[0].Quantity`).
 */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  traceId?: string;
  correlationId?: string;
  errors?: Record<string, string[]>;
  [extension: string]: unknown;
}

export type ValidationProblemDetails = ProblemDetails & {
  errors: Record<string, string[]>;
};

const KNOWN_KEYS = new Set([
  'type',
  'title',
  'status',
  'detail',
  'instance',
  'traceId',
  'correlationId',
  'errors',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/**
 * Parses an unknown JSON payload into ProblemDetails.
 *
 * Returns `null` when the payload is not an object or contains no recognizable problem
 * metadata. Unknown extension members are preserved so diagnostics remain available.
 */
export function parseProblemDetails(value: unknown): ProblemDetails | null {
  if (!isRecord(value)) {
    return null;
  }

  const problem: ProblemDetails = {};

  const type = readString(value, 'type');
  if (type !== undefined) problem.type = type;

  const title = readString(value, 'title');
  if (title !== undefined) problem.title = title;

  const detail = readString(value, 'detail');
  if (detail !== undefined) problem.detail = detail;

  const instance = readString(value, 'instance');
  if (instance !== undefined) problem.instance = instance;

  const traceId = readString(value, 'traceId');
  if (traceId !== undefined) problem.traceId = traceId;

  const correlationId = readString(value, 'correlationId');
  if (correlationId !== undefined) problem.correlationId = correlationId;

  if (typeof value.status === 'number' && Number.isInteger(value.status)) {
    problem.status = value.status;
  }

  if (isRecord(value.errors)) {
    const errors: Record<string, string[]> = {};

    for (const [field, messages] of Object.entries(value.errors)) {
      if (!Array.isArray(messages)) {
        continue;
      }

      const validMessages = messages.filter(
        (message): message is string => typeof message === 'string',
      );

      if (validMessages.length > 0) {
        errors[field] = validMessages;
      }
    }

    if (Object.keys(errors).length > 0) {
      problem.errors = errors;
    }
  }

  for (const [key, extension] of Object.entries(value)) {
    if (!KNOWN_KEYS.has(key)) {
      problem[key] = extension;
    }
  }

  return Object.keys(problem).length > 0 ? problem : null;
}

/** Returns normalized validation errors, or an empty object for non-validation problems. */
export function getFieldErrors(
  problem: ProblemDetails | null | undefined,
): Readonly<Record<string, string[]>> {
  return problem?.errors ?? {};
}

/**
 * Finds the first validation message for a field. Matching is case-insensitive because
 * the API returns PascalCase property names while frontend form fields use camelCase.
 */
export function getFieldErrorMessage(
  problem: ProblemDetails | null | undefined,
  field: string,
): string | undefined {
  const normalizedField = field.toLowerCase();

  for (const [key, messages] of Object.entries(getFieldErrors(problem))) {
    if (key.toLowerCase() === normalizedField) {
      return messages[0];
    }
  }

  return undefined;
}
