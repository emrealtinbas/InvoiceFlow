import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createFetchMock, jsonResponse, type RecordedRequest } from './http';
import { renderApp } from './render';

function emptyCustomerList(request: RecordedRequest) {
  const pathname = new URL(request.url).pathname;

  if (request.method === 'GET' && pathname === '/api/customers') {
    return jsonResponse({
      items: [],
      page: 1,
      pageSize: 20,
      totalCount: 0,
      totalPages: 0,
    });
  }

  if (request.method === 'GET' && pathname === '/api/invoices') {
    return jsonResponse({
      items: [],
      pageNumber: 1,
      pageSize: 20,
      totalCount: 0,
      totalPages: 0,
    });
  }

  return undefined;
}

describe('routing', () => {
  it('redirects the root route to the dashboard', async () => {
    const { router } = renderApp(['/']);

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });

    expect(router.state.location.pathname).toBe('/dashboard');
  });

  it('navigates from the sidebar to the customer list', async () => {
    const { router, user } = renderApp({
      fetchImpl: createFetchMock(emptyCustomerList),
    });

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await user.click(screen.getByRole('link', { name: 'Customers' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Customers' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/customers');
    expect(await screen.findByText('No customers yet')).toBeInTheDocument();
    const addLinks = screen.getAllByRole('link', { name: 'Add customer' });
    expect(addLinks.length).toBeGreaterThan(0);

    for (const link of addLinks) {
      expect(link).toHaveAttribute('href', '/customers/new');
    }

    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('navigates to the read-only invoice list', async () => {
    const { router, user } = renderApp({
      fetchImpl: createFetchMock(emptyCustomerList),
    });

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await user.click(screen.getByRole('link', { name: 'Invoices' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Invoices' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/invoices');
    expect(await screen.findByText('No invoices yet')).toBeInTheDocument();
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('renders a not-found page for unknown routes while keeping the shell', async () => {
    const { router } = renderApp(['/does-not-exist']);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/does-not-exist');
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });
});
