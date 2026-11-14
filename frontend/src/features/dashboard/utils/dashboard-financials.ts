import Decimal from 'decimal.js';

import type { InvoiceSummary } from '@/features/invoices/api/types';
import { isExactlySerializableDecimal } from '@/features/invoices/utils/invoice-calculations';

export interface DashboardFinancialTotals {
  issued: string;
  paid: string;
  outstanding: string;
}

export type DashboardFinancialResult =
  { available: true; totals: DashboardFinancialTotals } | { available: false; reason: string };

export function aggregateDashboardFinancials(
  invoices: readonly InvoiceSummary[],
): DashboardFinancialResult {
  let issued = new Decimal(0);
  let paid = new Decimal(0);
  let outstanding = new Decimal(0);

  for (const invoice of invoices) {
    if (!['Draft', 'Sent', 'Paid', 'Cancelled'].includes(invoice.status)) {
      return {
        available: false,
        reason: 'An unrecognized invoice status prevents reliable financial classification.',
      };
    }

    const amount = invoice.grandTotal.toString();
    if (!isExactlySerializableDecimal(amount, 2)) {
      return {
        available: false,
        reason:
          'At least one API amount cannot be aggregated safely under the JSON-number contract.',
      };
    }

    const decimal = new Decimal(amount);
    if (invoice.status === 'Sent') {
      issued = issued.plus(decimal);
      outstanding = outstanding.plus(decimal);
    } else if (invoice.status === 'Paid') {
      issued = issued.plus(decimal);
      paid = paid.plus(decimal);
    }
  }

  return {
    available: true,
    totals: {
      issued: issued.toFixed(2),
      paid: paid.toFixed(2),
      outstanding: outstanding.toFixed(2),
    },
  };
}

/** Formats an arbitrary-precision decimal without converting it back to a JS number. */
export function formatDashboardTry(value: string): string {
  const [integer = '0', fraction = '00'] = new Decimal(value).toFixed(2).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `₺${grouped},${fraction}`;
}
