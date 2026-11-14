export const dashboardKeys = {
  all: (scope: string) => ['dashboard', scope] as const,
  recentInvoices: (scope: string) => [...dashboardKeys.all(scope), 'recent-invoices'] as const,
  statusCounts: (scope: string) => [...dashboardKeys.all(scope), 'status-counts'] as const,
  financials: (scope: string) => [...dashboardKeys.all(scope), 'financials'] as const,
  customers: (scope: string) => [...dashboardKeys.all(scope), 'customers'] as const,
};
