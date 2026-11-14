import { z } from 'zod';

import type { ApiClient } from '@/lib/api';
import { endpoints } from '@/lib/api';

import type {
  CreateCustomerRequest,
  Customer,
  CustomerListQuery,
  CustomerPagedResponse,
  UpdateCustomerRequest,
} from './types';

/**
 * The API is authoritative, but a proxy or incompatible deployment can still return a
 * payload the frontend does not understand. Validate only the fields that are rendered.
 */
const customerSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  taxNumber: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().nullable(),
});

const customerPageSchema = z.object({
  items: z.array(customerSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalCount: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

/** Raised when a successful customer response does not match the documented contract. */
export class CustomerContractError extends Error {
  constructor() {
    super('The customer service returned an unexpected response.');
    this.name = 'CustomerContractError';
  }
}

function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new CustomerContractError();
  }

  return result.data;
}

export async function listCustomers(
  client: ApiClient,
  query: CustomerListQuery,
  signal?: AbortSignal,
): Promise<CustomerPagedResponse> {
  const payload = await client.get<unknown>(endpoints.customers.list, {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
    },
    ...(signal ? { signal } : {}),
  });

  return validate(customerPageSchema, payload);
}

export async function getCustomer(
  client: ApiClient,
  id: string,
  signal?: AbortSignal,
): Promise<Customer> {
  const payload = await client.get<unknown>(endpoints.customers.byId(id), {
    ...(signal ? { signal } : {}),
  });

  return validate(customerSchema, payload);
}

export async function createCustomer(
  client: ApiClient,
  request: CreateCustomerRequest,
): Promise<Customer> {
  const payload = await client.post<unknown>(endpoints.customers.list, request);

  return validate(customerSchema, payload);
}

export async function updateCustomer(
  client: ApiClient,
  id: string,
  request: UpdateCustomerRequest,
): Promise<Customer> {
  const payload = await client.put<unknown>(endpoints.customers.byId(id), request);

  return validate(customerSchema, payload);
}

export async function deleteCustomer(client: ApiClient, id: string): Promise<void> {
  await client.delete<void>(endpoints.customers.byId(id));
}
