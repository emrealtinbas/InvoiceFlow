import type { PagedResponse, SortDirection } from '@/lib/api/pagination';

/** Customer response. Ownership and Identity data are never exposed. */
export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
  /** ISO 8601 UTC timestamp. */
  createdAt: string;
  /** ISO 8601 UTC timestamp, or null when never updated. */
  updatedAt: string | null;
}

/**
 * Fields shared by create and update. The API trims values and stores blank optional
 * values as null. E-mail is normalized to lowercase and must be unique per owner.
 */
export interface CustomerWriteRequest {
  /** 2–200 characters, must not be blank. */
  name: string;
  /** Optional valid e-mail address, at most 254 characters. */
  email?: string | null;
  /** Optional; digits, spaces, +, -, and parentheses; at most 30 characters. */
  phone?: string | null;
  /** Optional free-form address, at most 500 characters. */
  address?: string | null;
  /** Optional 10 or 11 digit tax number. */
  taxNumber?: string | null;
}

export type CreateCustomerRequest = CustomerWriteRequest;
export type UpdateCustomerRequest = CustomerWriteRequest;

export type CustomerSortField = 'name' | 'email' | 'createdAt' | 'updatedAt';

/** Customer lists use `page`, unlike invoice lists which use `pageNumber`. */
export interface CustomerListQuery {
  page?: number;
  /** 1–100; defaults to 20. */
  pageSize?: number;
  /** Case-insensitive match on name, e-mail, or tax number. */
  search?: string;
  sortBy?: CustomerSortField;
  /** Defaults to `asc` for customers. */
  sortDirection?: SortDirection;
}

export type CustomerPagedResponse = PagedResponse<Customer>;
