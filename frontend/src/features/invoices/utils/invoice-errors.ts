import { ApiError, NetworkError, ParseError, isApiError } from '@/lib/api';

import { InvoiceContractError } from '../api/contracts';

export interface InvoiceReadError {
  message: string;
  correlationId?: string | undefined;
}

export function describeInvoiceReadError(error: unknown): InvoiceReadError {
  if (error instanceof InvoiceContractError || error instanceof ParseError) {
    return { message: 'The invoice service returned an unexpected response. Please try again.' };
  }

  if (error instanceof NetworkError) {
    return { message: 'Unable to reach the InvoiceFlow API. Check your connection and try again.' };
  }

  if (isApiError(error)) {
    const correlationId = error instanceof ApiError ? error.correlationId : undefined;

    if (error.status === 404) {
      return {
        message: 'The invoice was not found or is not available to your account.',
        correlationId,
      };
    }

    if (error.status === 429) {
      return {
        message: 'Too many requests. Wait a moment and try again.',
        correlationId,
      };
    }

    if (error.isServerError) {
      return {
        message: 'The invoice service is temporarily unavailable. Try again shortly.',
        correlationId,
      };
    }

    return {
      message: 'The invoice data could not be loaded. Please try again.',
      correlationId,
    };
  }

  return { message: 'Something went wrong. Please try again.' };
}
