import type { CreateInvoiceRequest, InvoiceItemRequest, UpdateInvoiceRequest } from '../api/types';
import type { InvoiceFormValues } from '../schemas/invoice-schema';
import { decimalStringToNumber } from './invoice-calculations';

function itemToRequest(item: InvoiceFormValues['items'][number]): InvoiceItemRequest {
  return {
    description: item.description.trim(),
    quantity: decimalStringToNumber(item.quantity, 3),
    unitPrice: decimalStringToNumber(item.unitPrice, 2),
    taxRate: decimalStringToNumber(item.taxRate, 2),
  };
}

export function toCreateInvoiceRequest(values: InvoiceFormValues): CreateInvoiceRequest {
  return {
    customerId: values.customerId,
    issueDate: values.issueDate,
    dueDate: values.dueDate,
    items: values.items.map(itemToRequest),
  };
}

export function toUpdateInvoiceRequest(
  values: InvoiceFormValues,
  concurrencyToken: string,
): UpdateInvoiceRequest {
  return { ...toCreateInvoiceRequest(values), concurrencyToken, issueDate: values.issueDate };
}
