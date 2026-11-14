import { z } from 'zod';

import type { Customer, CustomerWriteRequest } from '../api/types';

export const CUSTOMER_NAME_MIN_LENGTH = 2;
export const CUSTOMER_NAME_MAX_LENGTH = 200;
export const CUSTOMER_EMAIL_MAX_LENGTH = 254;
export const CUSTOMER_PHONE_MAX_LENGTH = 30;
export const CUSTOMER_ADDRESS_MAX_LENGTH = 500;

const optionalEmailSchema = z
  .string()
  .trim()
  .max(
    CUSTOMER_EMAIL_MAX_LENGTH,
    `E-mail must be ${CUSTOMER_EMAIL_MAX_LENGTH} characters or fewer.`,
  )
  .refine((value) => value === '' || z.email().safeParse(value).success, {
    message: 'Enter a valid e-mail address.',
  });

const optionalPhoneSchema = z
  .string()
  .trim()
  .max(CUSTOMER_PHONE_MAX_LENGTH, `Phone must be ${CUSTOMER_PHONE_MAX_LENGTH} characters or fewer.`)
  .regex(/^[0-9 +()-]*$/, "Use only digits, spaces, '+', '-', and parentheses.");

const optionalTaxNumberSchema = z
  .string()
  .trim()
  .regex(/^$|^[0-9]{10,11}$/, 'Enter a 10 or 11 digit tax number.');

/** Mirrors the released API's customer write rules. Optional blank values become null. */
export const customerFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a customer name.')
    .min(
      CUSTOMER_NAME_MIN_LENGTH,
      `Customer name must be at least ${CUSTOMER_NAME_MIN_LENGTH} characters.`,
    )
    .max(
      CUSTOMER_NAME_MAX_LENGTH,
      `Customer name must be ${CUSTOMER_NAME_MAX_LENGTH} characters or fewer.`,
    ),
  email: optionalEmailSchema,
  phone: optionalPhoneSchema,
  address: z
    .string()
    .trim()
    .max(
      CUSTOMER_ADDRESS_MAX_LENGTH,
      `Address must be ${CUSTOMER_ADDRESS_MAX_LENGTH} characters or fewer.`,
    ),
  taxNumber: optionalTaxNumberSchema,
});

export type CustomerFormValues = z.infer<typeof customerFormSchema>;
export type CustomerFormField = keyof CustomerFormValues;

export const CUSTOMER_FORM_FIELDS: readonly CustomerFormField[] = [
  'name',
  'email',
  'phone',
  'address',
  'taxNumber',
];

export function customerToFormValues(customer: Customer): CustomerFormValues {
  return {
    name: customer.name,
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    address: customer.address ?? '',
    taxNumber: customer.taxNumber ?? '',
  };
}

export function emptyCustomerFormValues(): CustomerFormValues {
  return { name: '', email: '', phone: '', address: '', taxNumber: '' };
}

function optionalValue(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === '' ? null : trimmed;
}

/** Converts validated form values into the full replacement payload the API expects. */
export function toCustomerWriteRequest(values: CustomerFormValues): CustomerWriteRequest {
  return {
    name: values.name.trim(),
    email: optionalValue(values.email),
    phone: optionalValue(values.phone),
    address: optionalValue(values.address),
    taxNumber: optionalValue(values.taxNumber),
  };
}
