import { describe, expect, it } from 'vitest';

import type { InvoiceSummary } from '@/features/invoices/api/types';
import {
  aggregateDashboardFinancials,
  formatDashboardTry,
} from '@/features/dashboard/utils/dashboard-financials';

import { invoiceSummary } from './invoice-fixtures';

function row(status: string, grandTotal: number): InvoiceSummary {
  return { ...invoiceSummary, id: `${status}-${grandTotal}`, status, grandTotal };
}

describe('dashboard financial aggregation', () => {
  it('classifies only Sent and Paid as issued amounts', () => {
    const result = aggregateDashboardFinancials([
      row('Draft', 100),
      row('Sent', 200.1),
      row('Paid', 300.2),
      row('Cancelled', 400),
    ]);

    expect(result).toEqual({
      available: true,
      totals: { issued: '500.30', paid: '300.20', outstanding: '200.10' },
    });
  });

  it('uses decimal arithmetic instead of binary floating-point sums', () => {
    const result = aggregateDashboardFinancials([row('Sent', 0.1), row('Paid', 0.2)]);
    expect(result.available && result.totals.issued).toBe('0.30');
  });

  it('rejects unsafe JSON-number amounts and unknown statuses', () => {
    expect(aggregateDashboardFinancials([row('Paid', Number('9999999999999999'))])).toMatchObject({
      available: false,
    });
    expect(aggregateDashboardFinancials([row('Archived', 10)])).toMatchObject({
      available: false,
    });
  });

  it('formats arbitrary precision TRY values without a number conversion', () => {
    expect(formatDashboardTry('12345678901234567890.30')).toBe('₺12.345.678.901.234.567.890,30');
  });
});
