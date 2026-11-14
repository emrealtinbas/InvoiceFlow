import type { InvoiceStatus, KnownInvoiceStatus } from '../api/types';

const STATUS_DESCRIPTIONS: Record<KnownInvoiceStatus, string> = {
  Draft: 'Editable draft that has not been sent.',
  Sent: 'Sent invoice awaiting payment.',
  Paid: 'Invoice marked as paid.',
  Cancelled: 'Cancelled invoice; this status is terminal.',
};

export function invoiceStatusDescription(status: InvoiceStatus): string {
  return status in STATUS_DESCRIPTIONS
    ? STATUS_DESCRIPTIONS[status as KnownInvoiceStatus]
    : 'The service returned an unrecognized invoice status.';
}
