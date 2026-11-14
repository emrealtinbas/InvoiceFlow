import { describe, expect, it } from 'vitest';

import {
  buildInvoiceListSearch,
  parseInvoiceListState,
} from '@/features/invoices/utils/invoice-list-params';
import {
  formatInvoiceDate,
  formatInvoiceMoney,
  formatInvoiceTimestamp,
} from '@/features/invoices/utils/format';
import { invoiceStatusDescription } from '@/features/invoices/utils/invoice-status';

describe('invoice display utilities', () => {
  it('formats safe TRY values using Turkish currency conventions', () => {
    const formatted = formatInvoiceMoney(1234.5, 'TRY');
    expect(formatted).toContain('1.234,50');
    expect(formatted).toContain('₺');
  });

  it('refuses monetary values whose cents are not safely representable', () => {
    expect(formatInvoiceMoney(Number('9999999999999999'), 'TRY')).toBe('Amount unavailable');
    expect(formatInvoiceMoney(Number.NaN, 'TRY')).toBe('Amount unavailable');
  });

  it('keeps calendar dates stable and treats audit timestamps as instants', () => {
    expect(formatInvoiceDate('2026-01-01')).toContain('1 Oca 2026');
    expect(formatInvoiceDate('invalid')).toBe('Not available');
    expect(formatInvoiceTimestamp(null)).toBe('Never updated');
    expect(formatInvoiceTimestamp('invalid')).toBe('Not available');
  });

  it('normalizes query state and provides safe unknown-status lifecycle text', () => {
    const state = parseInvoiceListState(
      new URLSearchParams(
        'pageNumber=2&status=Draft&issueDateFrom=2026-01-10&issueDateTo=2026-01-01&sortBy=grandTotal&sortDirection=asc',
      ),
    );
    const canonical = buildInvoiceListSearch(state);

    expect(state.pageNumber).toBe(2);
    expect(state.issueDateTo).toBe('');
    expect(canonical.has('issueDateTo')).toBe(false);
    expect(invoiceStatusDescription('Archived')).toContain('unrecognized');
  });
});
