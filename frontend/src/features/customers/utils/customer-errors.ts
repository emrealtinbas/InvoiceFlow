import { ApiError, NetworkError, isApiError } from '@/lib/api';

import { CustomerContractError } from '../api/contracts';
import { CUSTOMER_FORM_FIELDS, type CustomerFormField } from '../schemas/customer-schemas';

export type CustomerFieldErrors = Partial<Record<CustomerFormField, string>>;

export interface CustomerOperationError {
  message: string;
  correlationId?: string | undefined;
  fieldErrors: CustomerFieldErrors;
  notFound: boolean;
}

const DUPLICATE_EMAIL_MESSAGE = 'A customer with this e-mail address already exists.';
const INVOICE_CONFLICT_MESSAGE =
  'This customer cannot be deleted because it has invoices. Remove or reassign those invoices first.';

function correlationIdOf(error: unknown): string | undefined {
  return error instanceof ApiError ? error.correlationId : undefined;
}

function rateLimitMessage(error: ApiError): string {
  const seconds = error.retryAfterSeconds;

  if (seconds === undefined || seconds <= 0) {
    return 'Too many requests. Wait a moment and try again.';
  }

  if (seconds < 60) {
    return `Too many requests. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`;
  }

  const minutes = Math.ceil(seconds / 60);

  return `Too many requests. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

function blankOperationError(message: string): CustomerOperationError {
  return { message, fieldErrors: {}, notFound: false };
}

function collectFieldErrors(error: ApiError): CustomerFieldErrors {
  const fields: CustomerFieldErrors = {};

  for (const [key, messages] of Object.entries(error.fieldErrors)) {
    const normalized = key.toLowerCase();
    const field = CUSTOMER_FORM_FIELDS.find((candidate) => candidate.toLowerCase() === normalized);
    const message = messages[0];

    if (field !== undefined && message !== undefined && fields[field] === undefined) {
      fields[field] = message;
    }
  }

  return fields;
}

/** Maps create/update failures onto safe form feedback and per-field messages. */
export function describeCustomerSaveError(error: unknown): CustomerOperationError {
  const correlationId = correlationIdOf(error);

  if (error instanceof CustomerContractError) {
    return {
      ...blankOperationError(
        'The customer service returned an unexpected response. Please try again.',
      ),
      correlationId,
    };
  }

  if (error instanceof NetworkError) {
    return blankOperationError(
      'Unable to reach the InvoiceFlow API. Check your connection and try again.',
    );
  }

  if (isApiError(error)) {
    if (error.status === 404) {
      return {
        message: 'This customer no longer exists or is no longer available to your account.',
        correlationId,
        fieldErrors: {},
        notFound: true,
      };
    }

    if (error.status === 409) {
      return {
        message: DUPLICATE_EMAIL_MESSAGE,
        correlationId,
        fieldErrors: { email: 'Use a different e-mail address for this customer.' },
        notFound: false,
      };
    }

    if (error.status === 429) {
      return { ...blankOperationError(rateLimitMessage(error)), correlationId };
    }

    if (error.status === 400) {
      const fieldErrors = collectFieldErrors(error);

      return {
        message:
          Object.keys(fieldErrors).length > 0
            ? 'Check the highlighted fields and try again.'
            : 'The customer details could not be validated. Check the values and try again.',
        correlationId,
        fieldErrors,
        notFound: false,
      };
    }

    if (error.status === 401) {
      return {
        message: 'Your session is no longer valid. Sign in again to continue.',
        correlationId,
        fieldErrors: {},
        notFound: false,
      };
    }

    if (error.status === 403) {
      return {
        message: 'You do not have permission to change this customer.',
        correlationId,
        fieldErrors: {},
        notFound: false,
      };
    }

    if (error.isServerError) {
      return {
        message: 'The customer service is temporarily unavailable. Try again shortly.',
        correlationId,
        fieldErrors: {},
        notFound: false,
      };
    }

    return {
      message: 'The customer could not be saved. Please try again.',
      correlationId,
      fieldErrors: {},
      notFound: false,
    };
  }

  return blankOperationError('Something went wrong. Please try again.');
}

export interface CustomerDeleteError {
  message: string;
  correlationId?: string | undefined;
  notFound: boolean;
}

/** Delete conflicts are not e-mail conflicts; use the backend's invoice restriction. */
export function describeCustomerDeleteError(error: unknown): CustomerDeleteError {
  const correlationId = correlationIdOf(error);

  if (error instanceof CustomerContractError) {
    return {
      message: 'The customer service returned an unexpected response. Please try again.',
      correlationId,
      notFound: false,
    };
  }

  if (error instanceof NetworkError) {
    return {
      message: 'Unable to reach the InvoiceFlow API. Check your connection and try again.',
      notFound: false,
    };
  }

  if (isApiError(error)) {
    if (error.status === 404) {
      return {
        message: 'This customer no longer exists or is no longer available to your account.',
        correlationId,
        notFound: true,
      };
    }

    if (error.status === 409) {
      return { message: INVOICE_CONFLICT_MESSAGE, correlationId, notFound: false };
    }

    if (error.status === 429) {
      return { message: rateLimitMessage(error), correlationId, notFound: false };
    }

    if (error.status === 401) {
      return {
        message: 'Your session is no longer valid. Sign in again to continue.',
        correlationId,
        notFound: false,
      };
    }

    if (error.status === 403) {
      return {
        message: 'You do not have permission to delete this customer.',
        correlationId,
        notFound: false,
      };
    }

    if (error.isServerError) {
      return {
        message: 'The customer service is temporarily unavailable. Try again shortly.',
        correlationId,
        notFound: false,
      };
    }

    return {
      message: 'The customer could not be deleted. Please try again.',
      correlationId,
      notFound: false,
    };
  }

  return { message: 'Something went wrong. Please try again.', notFound: false };
}

export interface CustomerListError {
  message: string;
  correlationId?: string | undefined;
}

/** Safe list/read failure text. Not-found stays generic so ownership cannot be inferred. */
export function describeCustomerReadError(error: unknown): CustomerListError {
  const correlationId = correlationIdOf(error);

  if (error instanceof CustomerContractError) {
    return {
      message: 'The customer service returned an unexpected response. Please try again.',
    };
  }

  if (error instanceof NetworkError) {
    return {
      message: 'Unable to reach the InvoiceFlow API. Check your connection and try again.',
    };
  }

  if (isApiError(error)) {
    if (error.status === 404) {
      return {
        message: 'The customer was not found or is not available to your account.',
        correlationId,
      };
    }

    if (error.status === 429) {
      return { message: rateLimitMessage(error), correlationId };
    }

    if (error.isServerError) {
      return {
        message: 'The customer service is temporarily unavailable. Try again shortly.',
        correlationId,
      };
    }

    return { message: 'The customer data could not be loaded. Please try again.', correlationId };
  }

  return { message: 'Something went wrong. Please try again.' };
}
