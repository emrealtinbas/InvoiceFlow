import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { customerId, invoiceDetail, invoiceId, paidInvoiceSummary } from './invoice-fixtures';
import {
  createFetchMock,
  deferred,
  jsonResponse,
  problemResponse,
  type RecordedRequest,
} from './http';
import { renderApp } from './render';

const customer = {
  id: customerId,
  name: 'Acme Corporation',
  email: 'billing@acme.test',
  phone: null,
  address: null,
  taxNumber: null,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: null,
};

const customerPage = { items: [customer], page: 1, pageSize: 20, totalCount: 1, totalPages: 1 };

describe('invoice editor', () => {
  it('creates a Draft with dynamic lines and sends only backend input fields', async () => {
    const requests: RecordedRequest[] = [];
    const fetchImpl = createFetchMock((request) => {
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (path === '/api/customers' && request.method === 'GET') return jsonResponse(customerPage);
      if (path === `/api/customers/${customerId}` && request.method === 'GET')
        return jsonResponse(customer);
      if (path === '/api/invoices' && request.method === 'POST')
        return jsonResponse(invoiceDetail, { status: 201 });
      return undefined;
    });
    const { user } = renderApp({ initialEntries: ['/invoices/new'], fetchImpl });

    await screen.findByRole('heading', { level: 1, name: 'New invoice' });
    await screen.findByRole('option', { name: /Acme Corporation/ });
    await user.selectOptions(screen.getByLabelText('Customer'), customerId);
    await user.type(screen.getByLabelText('Description'), 'API implementation');
    await user.clear(screen.getByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '3');
    await user.clear(screen.getByLabelText('Unit price (TRY)'));
    await user.type(screen.getByLabelText('Unit price (TRY)'), '199.99');
    expect(await screen.findByText('₺719.96')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add line' }));
    expect(screen.getAllByText(/Line \d/)).toHaveLength(2);
    expect(screen.getAllByLabelText('Description')[1]).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Remove line 2' }));
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => expect(requests.some((request) => request.method === 'POST')).toBe(true));
    const post = requests.find((request) => request.method === 'POST');
    const body = JSON.parse(post?.body ?? '{}') as Record<string, unknown>;
    expect(body).toMatchObject({
      customerId,
      items: [{ description: 'API implementation', quantity: 3, unitPrice: 199.99, taxRate: 20 }],
    });
    expect(body).not.toHaveProperty('ownerId');
    expect(body).not.toHaveProperty('subtotal');
    expect(body).not.toHaveProperty('status');
  });

  it('loads a Draft update, includes the concurrency token, and preserves input on conflict', async () => {
    const requests: RecordedRequest[] = [];
    const fetchImpl = createFetchMock((request) => {
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (path === `/api/invoices/${invoiceId}` && request.method === 'GET')
        return jsonResponse(invoiceDetail);
      if (path === '/api/customers' && request.method === 'GET') return jsonResponse(customerPage);
      if (path === `/api/customers/${customerId}` && request.method === 'GET')
        return jsonResponse(customer);
      if (path === `/api/invoices/${invoiceId}` && request.method === 'PUT') {
        return problemResponse(
          { title: 'Conflict', status: 409, detail: 'The concurrency token is stale.' },
          409,
        );
      }
      return undefined;
    });
    const { user } = renderApp({ initialEntries: [`/invoices/${invoiceId}/edit`], fetchImpl });

    const description = await screen.findByLabelText('Description');
    expect(description).toHaveValue('API implementation');
    await user.clear(description);
    await user.type(description, 'Changed locally');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('The concurrency token is stale.')).toBeInTheDocument();
    expect(description).toHaveValue('Changed locally');
    const put = requests.find((request) => request.method === 'PUT');
    expect(JSON.parse(put?.body ?? '{}')).toMatchObject({
      concurrencyToken: invoiceDetail.concurrencyToken,
      items: [{ description: 'Changed locally' }],
    });
    await user.click(screen.getByRole('button', { name: 'Reload latest invoice' }));
    expect(screen.getByRole('heading', { name: 'Reload the latest invoice?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(description).toHaveValue('Changed locally');
  });

  it('shows field validation and does not submit an empty invoice', async () => {
    const requests: RecordedRequest[] = [];
    const fetchImpl = createFetchMock((request) => {
      requests.push(request);
      if (new URL(request.url).pathname === '/api/customers') return jsonResponse(customerPage);
      return undefined;
    });
    const { user } = renderApp({ initialEntries: ['/invoices/new'], fetchImpl });
    await screen.findByRole('heading', { level: 1, name: 'New invoice' });
    expect(screen.getByRole('searchbox', { name: 'Search customers' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Due date'));
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(await screen.findByText('Select a customer.')).toBeInTheDocument();
    const descriptionError = screen.getByText('Enter a line description.');
    const description = screen.getByLabelText('Description');
    expect(descriptionError).toHaveAttribute('role', 'alert');
    expect(description).toHaveAttribute('aria-describedby', descriptionError.id);
    const dateError = screen.getByText('Enter a due date.');
    expect(screen.getByLabelText('Due date')).toHaveAttribute('aria-describedby', dateError.id);
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it('does not render the editor for a non-Draft invoice', async () => {
    const fetchImpl = createFetchMock((request) => {
      if (new URL(request.url).pathname === `/api/invoices/${invoiceId}`) {
        return jsonResponse({
          ...invoiceDetail,
          ...paidInvoiceSummary,
          id: invoiceId,
          items: invoiceDetail.items,
        });
      }
      return undefined;
    });
    renderApp({ initialEntries: [`/invoices/${invoiceId}/edit`], fetchImpl });
    expect(
      await screen.findByRole('heading', { name: 'Invoice cannot be edited' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  it('prevents duplicate create submissions while the request is pending', async () => {
    const pending = deferred<Response>();
    let postCount = 0;
    const fetchImpl = createFetchMock((request) => {
      const path = new URL(request.url).pathname;
      if (path === '/api/customers' && request.method === 'GET') return jsonResponse(customerPage);
      if (path === `/api/customers/${customerId}` && request.method === 'GET')
        return jsonResponse(customer);
      if (path === '/api/invoices' && request.method === 'POST') {
        postCount += 1;
        return pending.promise;
      }
      return undefined;
    });
    const { user } = renderApp({ initialEntries: ['/invoices/new'], fetchImpl });
    await screen.findByRole('option', { name: /Acme Corporation/ });
    await user.selectOptions(screen.getByLabelText('Customer'), customerId);
    await user.type(screen.getByLabelText('Description'), 'Consulting');
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Saving…' }));
    expect(postCount).toBe(1);
    pending.resolve(jsonResponse(invoiceDetail, { status: 201 }));
  });
});
