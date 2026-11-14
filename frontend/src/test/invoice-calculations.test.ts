import { describe, expect, it } from 'vitest';

import {
  calculateInvoice,
  decimalStringToNumber,
  InvoiceCalculationError,
  isExactlySerializableDecimal,
} from '@/features/invoices/utils/invoice-calculations';

describe('invoice financial calculations', () => {
  it('calculates one line without tax', () => {
    expect(calculateInvoice([{ quantity: '2', unitPrice: '10', taxRate: '0' }])).toMatchObject({
      subtotal: '20.00',
      taxTotal: '0.00',
      grandTotal: '20.00',
    });
  });

  it('matches the backend example 3 × 199.99 at 20%', () => {
    const result = calculateInvoice([{ quantity: '3', unitPrice: '199.99', taxRate: '20' }]);
    expect(result.lines[0]).toEqual({
      lineSubtotal: '599.97',
      lineTax: '119.99',
      lineTotal: '719.96',
    });
    expect(result.grandTotal).toBe('719.96');
  });

  it('sums multiple lines after line-level rounding', () => {
    const result = calculateInvoice([
      { quantity: '0.025', unitPrice: '1.00', taxRate: '20' },
      { quantity: '0.025', unitPrice: '1.00', taxRate: '20' },
    ]);
    expect(result.subtotal).toBe('0.06');
    expect(result.taxTotal).toBe('0.02');
    expect(result.grandTotal).toBe('0.08');
  });

  it('supports fractional quantities', () => {
    expect(
      calculateInvoice([{ quantity: '2.125', unitPrice: '80.00', taxRate: '10' }]).grandTotal,
    ).toBe('187.00');
  });

  it('supports a zero unit price and zero tax', () => {
    expect(calculateInvoice([{ quantity: '5', unitPrice: '0', taxRate: '0' }]).grandTotal).toBe(
      '0.00',
    );
  });

  it('rounds positive midpoints away from zero like the nonnegative backend domain', () => {
    expect(
      calculateInvoice([{ quantity: '1.005', unitPrice: '1.00', taxRate: '0' }]).subtotal,
    ).toBe('1.01');
  });

  it('keeps invoice totals equal to rounded line totals', () => {
    const result = calculateInvoice([
      { quantity: '3', unitPrice: '199.99', taxRate: '20' },
      { quantity: '2', unitPrice: '750', taxRate: '20' },
    ]);
    expect(result.lines.map((line) => line.lineTotal)).toEqual(['719.96', '1800.00']);
    expect(result.grandTotal).toBe('2519.96');
  });

  it('detects calculated money overflow', () => {
    expect(() =>
      calculateInvoice([{ quantity: '2', unitPrice: '9999999999999999.99', taxRate: '0' }]),
    ).toThrow(InvoiceCalculationError);
  });

  it('is deterministic across repeated calculations', () => {
    const input = [{ quantity: '3.333', unitPrice: '19.99', taxRate: '18.25' }];
    expect(calculateInvoice(input)).toEqual(calculateInvoice(input));
  });

  it('allows the largest cent value that remains exact in the JSON-number boundary', () => {
    expect(isExactlySerializableDecimal('9007199254740.91', 2)).toBe(true);
    expect(decimalStringToNumber('9007199254740.91', 2)).toBe(9007199254740.91);
  });

  it('blocks a backend-valid value that JavaScript cannot serialize exactly', () => {
    expect(isExactlySerializableDecimal('9999999999999999.99', 2)).toBe(false);
    expect(() => decimalStringToNumber('9999999999999999.99', 2)).toThrow(
      /cannot be represented safely/i,
    );
  });

  it('blocks excess scale at the serialization boundary', () => {
    expect(isExactlySerializableDecimal('1.001', 2)).toBe(false);
  });
});
