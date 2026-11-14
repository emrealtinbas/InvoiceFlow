import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/app/providers/query-client';
import { customerKeys } from '@/features/customers/api/query-keys';

import { acmeCustomer, customerPage, requestPath, requestSearch } from './customer-fixtures';
import {
  createFetchMock,
  deferred,
  jsonResponse,
  problemResponse,
  type RecordedRequest,
} from './http';
import { renderApp, testUser } from './render';

function detailPath() {
  return `/api/customers/${acmeCustomer.id}`;
}

function detailAndDeleteFetch(
  requests: RecordedRequest[],
  deleteResponse: (request: RecordedRequest) => Response | Promise<Response>,
  listResponse: () => Response = () => jsonResponse(customerPage([])),
) {
  let deleted = false;

  return createFetchMock((request) => {
    requests.push(request);
    const path = requestPath(request);

    if (request.method === 'GET' && path === detailPath()) {
      // A real API returns 404 once the record is deleted; model that so a late
      // refetch cannot resurrect a stale record in the cache.
      if (deleted) {
        return problemResponse(
          { title: 'Not Found', status: 404, detail: 'The customer was not found.' },
          404,
        );
      }

      return jsonResponse(acmeCustomer);
    }

    if (request.method === 'GET' && path === '/api/customers') {
      return listResponse();
    }

    if (request.method === 'DELETE' && path === detailPath()) {
      const response = deleteResponse(request);

      if (response instanceof Response && response.status === 204) {
        deleted = true;
      }

      return response;
    }

    return undefined;
  });
}

describe('customer deletion', () => {
  it('requires confirmation and shows the customer name and consequences', async () => {
    const requests: RecordedRequest[] = [];
    const { user } = renderApp({
      initialEntries: [`/customers/${acmeCustomer.id}`],
      fetchImpl: detailAndDeleteFetch(requests, () => new Response(null, { status: 204 })),
    });

    await screen.findByRole('heading', { level: 1, name: acmeCustomer.name });
    await user.click(screen.getByRole('button', { name: `Delete ${acmeCustomer.name}` }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Delete customer?' })).toBeInTheDocument();
    expect(within(dialog).getByText(acmeCustomer.name)).toBeInTheDocument();
    expect(within(dialog).getByText(/This action cannot be undone/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Customers that have invoices cannot be deleted/),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete customer' })).toBeInTheDocument();
  });

  it('cancels deletion without sending a DELETE request', async () => {
    const requests: RecordedRequest[] = [];
    const { user } = renderApp({
      initialEntries: [`/customers/${acmeCustomer.id}`],
      fetchImpl: detailAndDeleteFetch(requests, () => new Response(null, { status: 204 })),
    });

    await screen.findByRole('heading', { level: 1, name: acmeCustomer.name });
    await user.click(screen.getByRole('button', { name: `Delete ${acmeCustomer.name}` }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
    expect(screen.getByRole('heading', { level: 1, name: acmeCustomer.name })).toBeInTheDocument();
  });

  it('deletes after confirmation, invalidates the list, and navigates away', async () => {
    const requests: RecordedRequest[] = [];
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { user, router } = renderApp({
      initialEntries: [`/customers/${acmeCustomer.id}`],
      fetchImpl: detailAndDeleteFetch(requests, () => new Response(null, { status: 204 })),
      queryClient,
    });

    await screen.findByRole('heading', { level: 1, name: acmeCustomer.name });
    await user.click(screen.getByRole('button', { name: `Delete ${acmeCustomer.name}` }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete customer' }));

    expect(await screen.findByText('No customers yet')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/customers');
    expect(await screen.findByText('Customer deleted.')).toBeInTheDocument();

    const deleteRequest = requests.find((request) => request.method === 'DELETE');
    expect(deleteRequest).toBeDefined();
    expect(requestPath(deleteRequest as RecordedRequest)).toBe(detailPath());
    expect(deleteRequest?.headers.get('Authorization')).toBe('Bearer test-access-token');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: customerKeys.lists(testUser.id) });
    await waitFor(() => {
      expect(
        queryClient.getQueryData(customerKeys.detail(testUser.id, acmeCustomer.id)),
      ).toBeUndefined();
    });
  });

  it('keeps the dialog open and explains the invoice conflict on 409', async () => {
    const requests: RecordedRequest[] = [];
    const { user, router } = renderApp({
      initialEntries: [`/customers/${acmeCustomer.id}`],
      fetchImpl: detailAndDeleteFetch(requests, () =>
        problemResponse(
          {
            title: 'Conflict',
            status: 409,
            detail: 'The customer cannot be deleted because it has invoices.',
          },
          409,
        ),
      ),
    });

    await screen.findByRole('heading', { level: 1, name: acmeCustomer.name });
    await user.click(screen.getByRole('button', { name: `Delete ${acmeCustomer.name}` }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete customer' }));

    expect(
      await within(dialog).findByText(
        'This customer cannot be deleted because it has invoices. Remove or reassign those invoices first.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/customers/${acmeCustomer.id}`);
    expect(within(dialog).getByRole('button', { name: 'Delete customer' })).toBeEnabled();
  });

  it('handles a 404 deletion as an already unavailable customer', async () => {
    const requests: RecordedRequest[] = [];
    const { user } = renderApp({
      initialEntries: [`/customers/${acmeCustomer.id}`],
      fetchImpl: detailAndDeleteFetch(requests, () =>
        problemResponse(
          {
            title: 'Not Found',
            status: 404,
            detail: 'The customer was not found.',
          },
          404,
        ),
      ),
    });

    await screen.findByRole('heading', { level: 1, name: acmeCustomer.name });
    await user.click(screen.getByRole('button', { name: `Delete ${acmeCustomer.name}` }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete customer' }));

    expect(
      await within(dialog).findByText(
        'This customer no longer exists or is no longer available to your account.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('prevents duplicate delete submissions while the request is pending', async () => {
    const pending = deferred<Response>();
    const requests: RecordedRequest[] = [];
    const { user } = renderApp({
      initialEntries: [`/customers/${acmeCustomer.id}`],
      fetchImpl: detailAndDeleteFetch(requests, () => pending.promise),
    });

    await screen.findByRole('heading', { level: 1, name: acmeCustomer.name });
    await user.click(screen.getByRole('button', { name: `Delete ${acmeCustomer.name}` }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete customer' }));

    const pendingButton = await within(dialog).findByRole('button', { name: 'Deleting…' });
    expect(pendingButton).toBeDisabled();
    await user.click(pendingButton);
    expect(requests.filter((request) => request.method === 'DELETE')).toHaveLength(1);

    await act(async () => {
      pending.resolve(new Response(null, { status: 204 }));
    });

    expect(await screen.findByText('No customers yet')).toBeInTheDocument();
  });

  it('moves to the previous page when deleting the only item on a page', async () => {
    const requests: RecordedRequest[] = [];
    const fetchImpl = createFetchMock((request) => {
      requests.push(request);
      const path = requestPath(request);

      if (request.method === 'GET' && path === '/api/customers') {
        const page = Number(requestSearch(request).get('page'));

        return jsonResponse(
          customerPage(page === 2 ? [acmeCustomer] : [acmeCustomer], {
            page,
            totalCount: 21,
            totalPages: 2,
          }),
        );
      }

      if (request.method === 'DELETE' && path === detailPath()) {
        return new Response(null, { status: 204 });
      }

      return undefined;
    });

    const { user, router } = renderApp({ initialEntries: ['/customers?page=2'], fetchImpl });

    await screen.findByRole('link', { name: acmeCustomer.name });
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `Delete ${acmeCustomer.name}` }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete customer' }));

    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get('page')).toBeNull();
    });
    await waitFor(() => {
      expect(requests.some((request) => requestSearch(request).get('page') === '1')).toBe(true);
    });
  });

  it('moves focus into the delete dialog and restores it after Escape', async () => {
    const requests: RecordedRequest[] = [];
    const { user } = renderApp({
      initialEntries: [`/customers/${acmeCustomer.id}`],
      fetchImpl: detailAndDeleteFetch(requests, () => new Response(null, { status: 204 })),
    });

    await screen.findByRole('heading', { level: 1, name: acmeCustomer.name });
    const deleteButton = screen.getByRole('button', { name: `Delete ${acmeCustomer.name}` });
    deleteButton.focus();
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus(),
    );

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteButton).toHaveFocus();
  });
});
