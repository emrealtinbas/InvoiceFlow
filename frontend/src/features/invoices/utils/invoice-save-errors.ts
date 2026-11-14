import { NetworkError, isApiError, type ApiError } from '@/lib/api';

import { InvoiceContractError } from '../api/contracts';

export interface InvoiceSaveError {
  message: string;
  correlationId?: string | undefined;
  fieldErrors: Readonly<Record<string, string>>;
  conflict: boolean;
  notFound: boolean;
}

function normalizeFieldPath(key: string): string {
  return key
    .replace(/^Items/i, 'items')
    .replace(/^CustomerId$/i, 'customerId')
    .replace(/^IssueDate$/i, 'issueDate')
    .replace(/^DueDate$/i, 'dueDate')
    .replace(/^ConcurrencyToken$/i, 'concurrencyToken')
    .replace(/\.Description/gi, '.description')
    .replace(/\.Quantity/gi, '.quantity')
    .replace(/\.UnitPrice/gi, '.unitPrice')
    .replace(/\.TaxRate/gi, '.taxRate');
}

function fieldErrorsOf(error: ApiError): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [key, messages] of Object.entries(error.fieldErrors)) {
    const message = messages[0];
    if (message !== undefined) result[normalizeFieldPath(key)] = message;
  }
  return result;
}

export function describeInvoiceSaveError(error: unknown): InvoiceSaveError {
  if (error instanceof NetworkError) {
    return {
      message: 'Unable to reach the InvoiceFlow API. Your draft is still available here.',
      fieldErrors: {},
      conflict: false,
      notFound: false,
    };
  }

  if (error instanceof InvoiceContractError) {
    return {
      message: 'The invoice was saved, but the service returned an unexpected response.',
      fieldErrors: {},
      conflict: false,
      notFound: false,
    };
  }

  if (isApiError(error)) {
    if (error.status === 409) {
      return {
        message:
          error.problem?.detail ??
          'This invoice changed after you opened it or is no longer a Draft. Reload the latest invoice before trying again.',
        correlationId: error.correlationId,
        fieldErrors: {},
        conflict: true,
        notFound: false,
      };
    }
    if (error.status === 404) {
      return {
        message:
          'The invoice or selected customer no longer exists or is unavailable to your account.',
        correlationId: error.correlationId,
        fieldErrors: {},
        conflict: false,
        notFound: true,
      };
    }
    if (error.status === 400) {
      return {
        message: 'Check the highlighted fields and try again.',
        correlationId: error.correlationId,
        fieldErrors: fieldErrorsOf(error),
        conflict: false,
        notFound: false,
      };
    }
    if (error.status === 401) {
      return {
        message: 'Your session expired. Sign in again to continue.',
        correlationId: error.correlationId,
        fieldErrors: {},
        conflict: false,
        notFound: false,
      };
    }
    if (error.isServerError) {
      return {
        message:
          'The invoice service is temporarily unavailable. Your draft has not been discarded.',
        correlationId: error.correlationId,
        fieldErrors: {},
        conflict: false,
        notFound: false,
      };
    }
  }

  return {
    message: 'The invoice could not be saved. Please try again.',
    fieldErrors: {},
    conflict: false,
    notFound: false,
  };
}
