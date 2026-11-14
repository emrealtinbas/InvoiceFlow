import { NetworkError, isApiError } from '@/lib/api';

import { InvoiceContractError } from '../api/contracts';

export interface InvoiceLifecycleError {
  message: string;
  correlationId?: string | undefined;
  conflict: boolean;
  notFound: boolean;
}

export function describeInvoiceLifecycleError(error: unknown): InvoiceLifecycleError {
  if (error instanceof NetworkError) {
    return {
      message: 'Unable to reach the InvoiceFlow API. No lifecycle change was confirmed.',
      conflict: false,
      notFound: false,
    };
  }

  if (error instanceof InvoiceContractError) {
    return {
      message:
        'The operation may have completed, but the service returned an unexpected response. Reload the invoice before continuing.',
      conflict: true,
      notFound: false,
    };
  }

  if (isApiError(error)) {
    if (error.status === 409) {
      return {
        message:
          error.problem?.detail ??
          'The invoice changed or this action is no longer valid. Reload the latest invoice before continuing.',
        correlationId: error.correlationId,
        conflict: true,
        notFound: false,
      };
    }

    if (error.status === 404) {
      return {
        message: 'The invoice no longer exists or is no longer available to your account.',
        correlationId: error.correlationId,
        conflict: false,
        notFound: true,
      };
    }

    if (error.status === 401) {
      return {
        message: 'Your session expired. Sign in again to continue.',
        correlationId: error.correlationId,
        conflict: false,
        notFound: false,
      };
    }

    if (error.isServerError) {
      return {
        message:
          'The invoice service is temporarily unavailable. No lifecycle change was confirmed.',
        correlationId: error.correlationId,
        conflict: false,
        notFound: false,
      };
    }
  }

  return {
    message: 'The invoice action could not be completed. Please try again.',
    conflict: false,
    notFound: false,
  };
}
