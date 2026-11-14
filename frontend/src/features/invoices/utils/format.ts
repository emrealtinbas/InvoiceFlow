const SAFE_CENTS_MAX = Number.MAX_SAFE_INTEGER;

/**
 * The API serializes decimals as JSON numbers. Refuse to display a monetary value when
 * its cents cannot be represented safely instead of silently showing a rounded value.
 */
export function formatInvoiceMoney(value: number, currency: string): string {
  const scaled = value * 100;
  const rounded = Math.round(scaled);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 2;

  if (
    !Number.isFinite(value) ||
    value < 0 ||
    Math.abs(rounded) > SAFE_CENTS_MAX ||
    Math.abs(scaled - rounded) > tolerance
  ) {
    return 'Amount unavailable';
  }

  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return 'Amount unavailable';
  }
}

/** Date-only values are formatted in UTC so the browser time zone cannot shift the day. */
export function formatInvoiceDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);

  if (year === undefined || month === undefined || day === undefined) {
    return 'Not available';
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date);
}

export function formatInvoiceTimestamp(value: string | null): string {
  if (value === null) return 'Never updated';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';

  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatInvoiceQuantity(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    maximumFractionDigits: 3,
  }).format(value);
}

export function formatTaxRate(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'percent',
    maximumFractionDigits: 2,
  }).format(value / 100);
}
