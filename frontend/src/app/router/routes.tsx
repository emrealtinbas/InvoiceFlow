import { lazy } from 'react';

import { Navigate, type RouteObject } from 'react-router-dom';

import { AuthLayout } from '@/app/layouts/auth-layout';
import { AppLayout } from '@/app/layouts/app-layout';
import { NotFoundPage } from '@/app/pages/not-found-page';
import { RouteErrorPage } from '@/app/pages/route-error-page';
import { PublicOnlyRoute } from '@/features/auth/components/public-only-route';
import { RequireAuth } from '@/features/auth/components/require-auth';

const DashboardPage = lazy(() =>
  import('@/features/dashboard/pages/dashboard-page').then((module) => ({
    default: module.DashboardPage,
  })),
);

const CustomersPage = lazy(() =>
  import('@/features/customers/pages/customers-page').then((module) => ({
    default: module.CustomersPage,
  })),
);

const CustomerCreatePage = lazy(() =>
  import('@/features/customers/pages/customer-create-page').then((module) => ({
    default: module.CustomerCreatePage,
  })),
);

const CustomerDetailPage = lazy(() =>
  import('@/features/customers/pages/customer-detail-page').then((module) => ({
    default: module.CustomerDetailPage,
  })),
);

const CustomerEditPage = lazy(() =>
  import('@/features/customers/pages/customer-edit-page').then((module) => ({
    default: module.CustomerEditPage,
  })),
);

const InvoicesPage = lazy(() =>
  import('@/features/invoices/pages/invoices-page').then((module) => ({
    default: module.InvoicesPage,
  })),
);

const InvoiceDetailPage = lazy(() =>
  import('@/features/invoices/pages/invoice-detail-page').then((module) => ({
    default: module.InvoiceDetailPage,
  })),
);

const CreateInvoicePage = lazy(() =>
  import('@/features/invoices/pages/create-invoice-page').then((module) => ({
    default: module.CreateInvoicePage,
  })),
);

const EditInvoicePage = lazy(() =>
  import('@/features/invoices/pages/edit-invoice-page').then((module) => ({
    default: module.EditInvoicePage,
  })),
);

const LoginPage = lazy(() =>
  import('@/features/auth/pages/login-page').then((module) => ({
    default: module.LoginPage,
  })),
);

const RegisterPage = lazy(() =>
  import('@/features/auth/pages/register-page').then((module) => ({
    default: module.RegisterPage,
  })),
);

export const routes: RouteObject[] = [
  {
    element: <AuthLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <PublicOnlyRoute />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
        ],
      },
    ],
  },
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'customers', element: <CustomersPage /> },
          { path: 'customers/new', element: <CustomerCreatePage /> },
          { path: 'customers/:id', element: <CustomerDetailPage /> },
          { path: 'customers/:id/edit', element: <CustomerEditPage /> },
          { path: 'invoices', element: <InvoicesPage /> },
          { path: 'invoices/new', element: <CreateInvoicePage /> },
          { path: 'invoices/:id', element: <InvoiceDetailPage /> },
          { path: 'invoices/:id/edit', element: <EditInvoicePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
