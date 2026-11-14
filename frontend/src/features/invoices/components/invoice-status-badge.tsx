import { Badge, type BadgeProps } from '@/components/ui/badge';

import type { InvoiceStatus, KnownInvoiceStatus } from '../api/types';

const STATUS_PRESENTATION: Record<
  KnownInvoiceStatus,
  { label: string; description: string; variant: BadgeProps['variant'] }
> = {
  Draft: {
    label: 'Draft',
    description: 'Editable draft that has not been sent.',
    variant: 'outline',
  },
  Sent: {
    label: 'Sent',
    description: 'Sent invoice awaiting payment.',
    variant: 'default',
  },
  Paid: {
    label: 'Paid',
    description: 'Invoice marked as paid.',
    variant: 'success',
  },
  Cancelled: {
    label: 'Cancelled',
    description: 'Cancelled invoice; this status is terminal.',
    variant: 'destructive',
  },
};

function isKnownStatus(status: InvoiceStatus): status is KnownInvoiceStatus {
  return status in STATUS_PRESENTATION;
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const presentation = isKnownStatus(status)
    ? STATUS_PRESENTATION[status]
    : {
        label: 'Unknown',
        description: 'The service returned an unrecognized invoice status.',
        variant: 'secondary' as const,
      };

  return (
    <Badge
      variant={presentation.variant}
      aria-label={`Invoice status: ${presentation.label}`}
      title={presentation.description}
    >
      {presentation.label}
    </Badge>
  );
}
