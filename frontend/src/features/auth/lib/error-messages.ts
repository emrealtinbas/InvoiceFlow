import { ApiError, NetworkError, isApiError } from '@/lib/api';

import { AuthContractError, IdentityVerificationError } from '../api/contracts';

export interface LoginErrorDescription {
  message: string;
  correlationId?: string | undefined;
  fields: Partial<Record<'email' | 'password', string>>;
}

export interface RegistrationErrorDescription {
  message: string;
  correlationId?: string | undefined;
  fields: Partial<Record<'email' | 'password', string>>;
}

const INVALID_CREDENTIALS = 'E-mail or password is incorrect.';

function correlationIdOf(error: unknown): string | undefined {
  return error instanceof ApiError ? error.correlationId : undefined;
}

function rateLimitMessage(error: ApiError): string {
  const seconds = error.retryAfterSeconds;

  if (seconds === undefined || seconds <= 0) {
    return 'Too many attempts. Wait a moment and try again.';
  }

  if (seconds < 60) {
    return `Too many attempts. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`;
  }

  const minutes = Math.ceil(seconds / 60);

  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

function unknownError(): string {
  return 'Something went wrong. Please try again.';
}

/** Maps login failures to fixed, user-safe messages. Raw exception text is never rendered. */
export function describeLoginError(error: unknown): LoginErrorDescription {
  const correlationId = correlationIdOf(error);
  const fields: LoginErrorDescription['fields'] = {};

  if (error instanceof AuthContractError) {
    return {
      message: 'The authentication service returned an unexpected response. Please try again.',
      fields,
    };
  }

  if (error instanceof IdentityVerificationError) {
    return {
      message:
        'Sign-in could not be completed because your account could not be verified. Please try again.',
      correlationId: correlationIdOf(error.cause),
      fields,
    };
  }

  if (error instanceof NetworkError) {
    return {
      message: 'Unable to reach the InvoiceFlow API. Check your connection and try again.',
      fields,
    };
  }

  if (isApiError(error)) {
    if (error.status === 401) {
      return { message: INVALID_CREDENTIALS, correlationId, fields };
    }

    if (error.status === 429) {
      return { message: rateLimitMessage(error), correlationId, fields };
    }

    if (error.status === 400) {
      for (const [key, messages] of Object.entries(error.fieldErrors)) {
        const field = key.toLowerCase();
        const message = messages[0];

        if (message === undefined) {
          continue;
        }

        if (field === 'email' && fields.email === undefined) {
          fields.email = message;
        }

        if (field === 'password' && fields.password === undefined) {
          fields.password = message;
        }
      }

      return {
        message:
          Object.keys(fields).length > 0
            ? 'Check the highlighted fields and try again.'
            : 'The sign-in request could not be validated. Check your details and try again.',
        correlationId,
        fields,
      };
    }

    if (error.isServerError) {
      return {
        message: 'The authentication service is temporarily unavailable. Try again shortly.',
        correlationId,
        fields,
      };
    }

    return {
      message: 'Sign-in could not be completed. Please try again.',
      correlationId,
      fields,
    };
  }

  return { message: unknownError(), fields };
}

const IDENTITY_PASSWORD_PREFIX = 'password';
const IDENTITY_EMAIL_KEYS = new Set(['email', 'username', 'duplicateemail', 'duplicateusername']);

/** Maps Identity validation codes and HTTP conflict responses onto the registration form. */
export function describeRegistrationError(error: unknown): RegistrationErrorDescription {
  const correlationId = correlationIdOf(error);
  const fields: RegistrationErrorDescription['fields'] = {};

  if (error instanceof AuthContractError) {
    return {
      message: 'The registration service returned an unexpected response. Please try again.',
      fields,
    };
  }

  if (error instanceof NetworkError) {
    return {
      message: 'Unable to reach the InvoiceFlow API. Check your connection and try again.',
      fields,
    };
  }

  if (isApiError(error)) {
    if (error.status === 409) {
      return {
        message: 'An account with this e-mail address already exists.',
        correlationId,
        fields: { email: 'Use a different e-mail address or sign in instead.' },
      };
    }

    if (error.status === 429) {
      return { message: rateLimitMessage(error), correlationId, fields };
    }

    if (error.status === 400) {
      let formMessage: string | undefined;

      for (const [key, messages] of Object.entries(error.fieldErrors)) {
        const normalizedKey = key.toLowerCase();
        const message = messages[0];

        if (message === undefined) {
          continue;
        }

        if (normalizedKey.startsWith(IDENTITY_PASSWORD_PREFIX)) {
          fields.password ??= message;
          continue;
        }

        if (IDENTITY_EMAIL_KEYS.has(normalizedKey)) {
          fields.email ??= message;
          continue;
        }

        formMessage ??= message;
      }

      return {
        message:
          formMessage ??
          (Object.keys(fields).length > 0
            ? 'Check the highlighted fields and try again.'
            : 'Registration could not be completed. Check your details and try again.'),
        correlationId,
        fields,
      };
    }

    if (error.isServerError) {
      return {
        message: 'The registration service is temporarily unavailable. Try again shortly.',
        correlationId,
        fields,
      };
    }

    return {
      message: 'Registration could not be completed. Please try again.',
      correlationId,
      fields,
    };
  }

  return { message: unknownError(), fields };
}
