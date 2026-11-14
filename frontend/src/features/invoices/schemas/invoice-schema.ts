import Decimal from 'decimal.js';
import { z } from 'zod';

import type { Invoice } from '../api/types';
import {
  MAXIMUM_MONEY,
  MAXIMUM_QUANTITY,
  isExactlySerializableDecimal,
} from '../utils/invoice-calculations';

export const MAX_INVOICE_ITEMS = 100;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function decimalField(label: string, scale: number, minimum: Decimal, maximum: Decimal) {
  return z
    .string()
    .trim()
    .superRefine((value, context) => {
      if (value === '') {
        context.addIssue({ code: 'custom', message: `Enter ${label.toLowerCase()}.` });
        return;
      }
      if (!/^\d+(?:\.\d+)?$/.test(value)) {
        context.addIssue({ code: 'custom', message: `${label} must be a decimal number.` });
        return;
      }
      const fractional = value.split('.')[1]?.length ?? 0;
      if (fractional > scale) {
        context.addIssue({
          code: 'custom',
          message: `${label} supports at most ${scale} decimal places.`,
        });
        return;
      }
      const number = new Decimal(value);
      if (number.lessThan(minimum) || number.greaterThan(maximum)) {
        context.addIssue({ code: 'custom', message: `${label} is outside the supported range.` });
        return;
      }
      if (!isExactlySerializableDecimal(value, scale)) {
        context.addIssue({
          code: 'custom',
          message: `${label} cannot be sent exactly through the current JSON-number API. Enter a smaller value.`,
        });
      }
    });
}

export const invoiceItemFormSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, 'Enter a line description.')
    .max(500, 'Description must be 500 characters or fewer.'),
  quantity: decimalField('Quantity', 3, new Decimal('0.001'), MAXIMUM_QUANTITY),
  unitPrice: decimalField('Unit price', 2, new Decimal(0), MAXIMUM_MONEY),
  taxRate: decimalField('Tax rate', 2, new Decimal(0), new Decimal(100)),
});

export const invoiceFormSchema = z
  .object({
    customerId: z.string().regex(GUID, 'Select a customer.'),
    issueDate: z.string().regex(DATE, 'Enter an issue date.'),
    dueDate: z.string().regex(DATE, 'Enter a due date.'),
    items: z
      .array(invoiceItemFormSchema)
      .min(1, 'Add at least one invoice item.')
      .max(MAX_INVOICE_ITEMS, `An invoice can contain at most ${MAX_INVOICE_ITEMS} items.`),
  })
  .superRefine((values, context) => {
    if (
      DATE.test(values.issueDate) &&
      DATE.test(values.dueDate) &&
      values.dueDate < values.issueDate
    ) {
      context.addIssue({
        code: 'custom',
        path: ['dueDate'],
        message: 'Due date must be on or after issue date.',
      });
    }
  });

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

export function emptyInvoiceFormValues(today: string): InvoiceFormValues {
  return {
    customerId: '',
    issueDate: today,
    dueDate: today,
    items: [{ description: '', quantity: '1', unitPrice: '0', taxRate: '20' }],
  };
}

export function invoiceToFormValues(invoice: Invoice): InvoiceFormValues {
  return {
    customerId: invoice.customerId,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: item.unitPrice.toFixed(2),
      taxRate: item.taxRate.toFixed(2),
    })),
  };
}
