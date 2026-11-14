import { describe, expect, it } from 'vitest';

import {
  getFieldErrorMessage,
  getFieldErrors,
  parseProblemDetails,
} from '@/lib/api/problem-details';

const validationProblem = {
  type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
  title: 'One or more validation errors occurred.',
  status: 400,
  detail: 'The request could not be validated. See the errors property for details.',
  instance: '/api/customers',
  traceId: 'correlation-value',
  correlationId: 'correlation-value',
  errors: {
    Name: ['The Name field is required.'],
    Email: ['The Email field is not a valid e-mail address.'],
  },
};

describe('parseProblemDetails', () => {
  it('parses the API problem contract including extensions and validation errors', () => {
    expect(parseProblemDetails(validationProblem)).toEqual(validationProblem);
  });

  it('preserves unknown extension members', () => {
    const parsed = parseProblemDetails({ title: 'Conflict', retryable: false });

    expect(parsed).toMatchObject({ title: 'Conflict', retryable: false });
  });

  it('returns null for values that are not problem objects', () => {
    expect(parseProblemDetails(null)).toBeNull();
    expect(parseProblemDetails('bad gateway')).toBeNull();
    expect(parseProblemDetails([])).toBeNull();
    expect(parseProblemDetails({})).toBeNull();
    expect(parseProblemDetails({ unrelated: true })).toEqual({ unrelated: true });
  });

  it('drops malformed fields instead of trusting arbitrary JSON', () => {
    const parsed = parseProblemDetails({
      status: '400',
      title: 42,
      detail: '',
      instance: null,
      correlationId: 'abc',
    });

    expect(parsed).toEqual({ correlationId: 'abc' });
  });

  it('normalizes validation errors and removes non-string messages', () => {
    const parsed = parseProblemDetails({
      status: 400,
      errors: {
        Name: ['Required', 7, null],
        Empty: [],
        NotAnArray: 'nope',
      },
    });

    expect(parsed?.errors).toEqual({ Name: ['Required'] });
  });
});

describe('validation error helpers', () => {
  it('reads errors and matches field names case-insensitively', () => {
    const problem = parseProblemDetails(validationProblem);

    expect(getFieldErrors(problem)).toHaveProperty('Name');
    expect(getFieldErrorMessage(problem, 'email')).toBe(
      'The Email field is not a valid e-mail address.',
    );
    expect(getFieldErrorMessage(problem, 'missing')).toBeUndefined();
    expect(getFieldErrors(null)).toEqual({});
  });
});
