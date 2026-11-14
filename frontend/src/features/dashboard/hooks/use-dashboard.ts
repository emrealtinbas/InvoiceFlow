import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/session/context';
import { useApiClient } from '@/lib/api';

import {
  getCustomerSummary,
  getDashboardFinancials,
  getInvoiceStatusCounts,
  getRecentInvoices,
} from '../api/contracts';
import { dashboardKeys } from '../api/query-keys';

const DASHBOARD_STALE_TIME = 60_000;

function useDashboardScope(): string {
  const { user } = useAuth();
  return user?.id ?? 'anonymous';
}

export function useDashboardRecentInvoices() {
  const client = useApiClient();
  const scope = useDashboardScope();
  return useQuery({
    queryKey: dashboardKeys.recentInvoices(scope),
    queryFn: ({ signal }) => getRecentInvoices(client, signal),
    staleTime: DASHBOARD_STALE_TIME,
  });
}

export function useDashboardStatusCounts() {
  const client = useApiClient();
  const scope = useDashboardScope();
  return useQuery({
    queryKey: dashboardKeys.statusCounts(scope),
    queryFn: ({ signal }) => getInvoiceStatusCounts(client, signal),
    staleTime: DASHBOARD_STALE_TIME,
  });
}

export function useDashboardFinancials() {
  const client = useApiClient();
  const scope = useDashboardScope();
  return useQuery({
    queryKey: dashboardKeys.financials(scope),
    queryFn: ({ signal }) => getDashboardFinancials(client, signal),
    staleTime: DASHBOARD_STALE_TIME,
  });
}

export function useDashboardCustomers() {
  const client = useApiClient();
  const scope = useDashboardScope();
  return useQuery({
    queryKey: dashboardKeys.customers(scope),
    queryFn: ({ signal }) => getCustomerSummary(client, signal),
    staleTime: DASHBOARD_STALE_TIME,
  });
}
