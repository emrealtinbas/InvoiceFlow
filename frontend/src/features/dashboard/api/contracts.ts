import type { ApiClient } from '@/lib/api';

import { listCustomers } from '@/features/customers/api/contracts';
import type { CustomerPagedResponse } from '@/features/customers/api/types';
import { listInvoices } from '@/features/invoices/api/contracts';
import type {
  InvoiceListResponse,
  InvoiceSummary,
  KnownInvoiceStatus,
} from '@/features/invoices/api/types';

import {
  aggregateDashboardFinancials,
  type DashboardFinancialResult,
} from '../utils/dashboard-financials';

export const DASHBOARD_FINANCIAL_PAGE_SIZE = 100;
export const DASHBOARD_MAX_FINANCIAL_PAGES = 10;
export const DASHBOARD_MAX_FINANCIAL_INVOICES =
  DASHBOARD_FINANCIAL_PAGE_SIZE * DASHBOARD_MAX_FINANCIAL_PAGES;

export type DashboardStatusCounts = Record<KnownInvoiceStatus, number>;

export interface DashboardFinancialSnapshot {
  totalCount: number;
  pagesRead: number;
  result: DashboardFinancialResult;
}

export function getRecentInvoices(
  client: ApiClient,
  signal?: AbortSignal,
): Promise<InvoiceListResponse> {
  return listInvoices(
    client,
    { pageNumber: 1, pageSize: 5, sortBy: 'createdAt', sortDirection: 'desc' },
    signal,
  );
}

export async function getInvoiceStatusCounts(
  client: ApiClient,
  signal?: AbortSignal,
): Promise<DashboardStatusCounts> {
  const statuses: KnownInvoiceStatus[] = ['Draft', 'Sent', 'Paid', 'Cancelled'];
  const pages = await Promise.all(
    statuses.map((status) =>
      listInvoices(
        client,
        { pageNumber: 1, pageSize: 1, status, sortBy: 'createdAt', sortDirection: 'desc' },
        signal,
      ),
    ),
  );

  return Object.fromEntries(
    statuses.map((status, index) => [status, pages[index]?.totalCount ?? 0]),
  ) as DashboardStatusCounts;
}

export async function getDashboardFinancials(
  client: ApiClient,
  signal?: AbortSignal,
): Promise<DashboardFinancialSnapshot> {
  const first = await listInvoices(
    client,
    {
      pageNumber: 1,
      pageSize: DASHBOARD_FINANCIAL_PAGE_SIZE,
      sortBy: 'createdAt',
      sortDirection: 'desc',
    },
    signal,
  );

  if (first.totalPages > DASHBOARD_MAX_FINANCIAL_PAGES) {
    return {
      totalCount: first.totalCount,
      pagesRead: 1,
      result: {
        available: false,
        reason: `Complete aggregation is limited to ${DASHBOARD_MAX_FINANCIAL_INVOICES.toLocaleString()} invoices; this account has ${first.totalCount.toLocaleString()}.`,
      },
    };
  }

  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, index) =>
      listInvoices(
        client,
        {
          pageNumber: index + 2,
          pageSize: DASHBOARD_FINANCIAL_PAGE_SIZE,
          sortBy: 'createdAt',
          sortDirection: 'desc',
        },
        signal,
      ),
    ),
  );
  const invoices: InvoiceSummary[] = [
    ...first.items,
    ...remainingPages.flatMap((page) => page.items),
  ];

  return {
    totalCount: first.totalCount,
    pagesRead: Math.max(1, first.totalPages),
    result: aggregateDashboardFinancials(invoices),
  };
}

export function getCustomerSummary(
  client: ApiClient,
  signal?: AbortSignal,
): Promise<CustomerPagedResponse> {
  return listCustomers(
    client,
    { page: 1, pageSize: 3, sortBy: 'createdAt', sortDirection: 'desc' },
    signal,
  );
}
