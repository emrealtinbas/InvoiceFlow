import type { Customer, CustomerPagedResponse } from '@/features/customers/api/types';

export const acmeCustomer: Customer = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Acme Studio',
  email: 'billing@acme.test',
  phone: '+90 555 000 00 00',
  address: 'Istanbul, Türkiye',
  taxNumber: '1234567890',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: null,
};

export const globexCustomer: Customer = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  name: 'Globex Design',
  email: 'accounts@globex.test',
  phone: null,
  address: null,
  taxNumber: null,
  createdAt: '2026-11-02T11:30:00.000Z',
  updatedAt: '2026-11-03T09:15:00.000Z',
};

export const newCustomer: Customer = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  name: 'Northwind Demo',
  email: 'billing@northwind.test',
  phone: '+90 555 111 22 33',
  address: 'Ankara, Türkiye',
  taxNumber: '9876543210',
  createdAt: '2026-11-13T12:00:00.000Z',
  updatedAt: null,
};

export const otherOwnerCustomer: Customer = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  name: 'Other Owner Records',
  email: 'private@example.test',
  phone: null,
  address: null,
  taxNumber: null,
  createdAt: '2026-11-04T08:00:00.000Z',
  updatedAt: null,
};

export function customerPage(
  items: Customer[],
  overrides: Partial<Omit<CustomerPagedResponse, 'items'>> = {},
): CustomerPagedResponse {
  const pageSize = overrides.pageSize ?? 20;
  const totalCount = overrides.totalCount ?? items.length;

  return {
    items,
    page: overrides.page ?? 1,
    pageSize,
    totalCount,
    totalPages: overrides.totalPages ?? Math.ceil(totalCount / pageSize),
  };
}

export function requestPath(request: { url: string }): string {
  return new URL(request.url).pathname;
}

export function requestSearch(request: { url: string }): URLSearchParams {
  return new URL(request.url).searchParams;
}
