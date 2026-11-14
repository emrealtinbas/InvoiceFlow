/**
 * Path builders for the released InvoiceFlow API v1.0.0.
 * These mirror the backend controllers; see frontend/docs/api-contract.md.
 */
export const endpoints = {
  auth: {
    register: '/api/auth/register',
    login: '/api/auth/login',
    me: '/api/auth/me',
  },
  customers: {
    list: '/api/customers',
    byId: (id: string) => `/api/customers/${encodeURIComponent(id)}`,
  },
  invoices: {
    list: '/api/invoices',
    byId: (id: string) => `/api/invoices/${encodeURIComponent(id)}`,
    send: (id: string) => `/api/invoices/${encodeURIComponent(id)}/send`,
    markPaid: (id: string) => `/api/invoices/${encodeURIComponent(id)}/mark-paid`,
    cancel: (id: string) => `/api/invoices/${encodeURIComponent(id)}/cancel`,
  },
  health: {
    readiness: '/health',
    liveness: '/health/live',
  },
} as const;
