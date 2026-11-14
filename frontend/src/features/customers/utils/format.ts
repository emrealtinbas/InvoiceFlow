/** Formats API timestamps in the browser locale; malformed values never render `Invalid Date`. */
export function formatCustomerDateTime(value: string | null): string {
  if (value === null || value === '') {
    return 'Not available';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
