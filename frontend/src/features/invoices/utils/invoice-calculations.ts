import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const MAXIMUM_MONEY = new Decimal('9999999999999999.99');
export const MAXIMUM_QUANTITY = new Decimal('999999999999999.999');
const MAX_SAFE_INTEGER_DECIMAL = new Decimal(Number.MAX_SAFE_INTEGER);

export interface InvoiceCalculationInput {
  quantity: string;
  unitPrice: string;
  taxRate: string;
}

export interface InvoiceLineCalculation {
  lineSubtotal: string;
  lineTax: string;
  lineTotal: string;
}

export interface InvoiceCalculation {
  lines: InvoiceLineCalculation[];
  subtotal: string;
  taxTotal: string;
  grandTotal: string;
}

export class InvoiceCalculationError extends Error {
  constructor() {
    super('The calculated invoice values exceed the supported financial range.');
    this.name = 'InvoiceCalculationError';
  }
}

function money(value: Decimal): Decimal {
  const rounded = value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (rounded.isNegative() || rounded.greaterThan(MAXIMUM_MONEY)) {
    throw new InvoiceCalculationError();
  }
  return rounded;
}

export function calculateInvoice(inputs: readonly InvoiceCalculationInput[]): InvoiceCalculation {
  let subtotal = new Decimal(0);
  let taxTotal = new Decimal(0);
  const lines: InvoiceLineCalculation[] = [];

  for (const input of inputs) {
    const lineSubtotal = money(new Decimal(input.quantity).times(input.unitPrice));
    const lineTax = money(lineSubtotal.times(input.taxRate).dividedBy(100));
    const lineTotal = money(lineSubtotal.plus(lineTax));
    subtotal = money(subtotal.plus(lineSubtotal));
    taxTotal = money(taxTotal.plus(lineTax));
    lines.push({
      lineSubtotal: lineSubtotal.toFixed(2),
      lineTax: lineTax.toFixed(2),
      lineTotal: lineTotal.toFixed(2),
    });
  }

  const grandTotal = money(subtotal.plus(taxTotal));
  return {
    lines,
    subtotal: subtotal.toFixed(2),
    taxTotal: taxTotal.toFixed(2),
    grandTotal: grandTotal.toFixed(2),
  };
}

export function isExactlySerializableDecimal(value: string, scale: number): boolean {
  try {
    const decimal = new Decimal(value);
    const scaled = decimal.times(new Decimal(10).pow(scale));
    if (!scaled.isInteger() || scaled.abs().greaterThan(MAX_SAFE_INTEGER_DECIMAL)) return false;
    const numeric = Number(value);
    return Number.isFinite(numeric) && new Decimal(numeric.toString()).equals(decimal);
  } catch {
    return false;
  }
}

export function decimalStringToNumber(value: string, scale: number): number {
  if (!isExactlySerializableDecimal(value, scale)) {
    throw new Error(
      'This value cannot be represented safely by the current JSON-number API contract.',
    );
  }
  return Number(value);
}

export function formatTryAmount(value: string): string {
  return `₺${new Decimal(value).toFixed(2)}`;
}
