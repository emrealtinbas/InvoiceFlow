import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/app/providers/query-client';
import { invoiceKeys } from '@/features/invoices/api/query-keys';
import type { Invoice } from '@/features/invoices/api/types';

import {
  customerId,
  invoiceDetail,
  invoiceId,
  invoicePage,
  requestPath,
  requestSearch,
} from './invoice-fixtures';
import {
  createFetchMock,
  deferred,
  jsonResponse,
  problemResponse,
  type RecordedRequest,
} from './http';
import { renderApp, testUser } from './render';

const customer = {
  id: customerId,
  name: 'Acme Studio',
  email: 'billing@acme.test',
  phone: null,
  address: null,
  taxNumber: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: null,
};

function invoiceWith(status: string, token = invoiceDetail.concurrencyToken): Invoice {
  return { ...invoiceDetail, status, concurrencyToken: token, updatedAt: '2026-11-14T08:00:00Z' };
}

function detailFetch(
  invoice: Invoice,
  requests: RecordedRequest[] = [],
  lifecycle?: (request: RecordedRequest) => Response | Promise<Response>,
) {
  return createFetchMock((request) => {
    requests.push(request);
    const path = requestPath(request);

    if (request.method === 'GET' && path === `/api/invoices/${invoiceId}`) {
      return jsonResponse(invoice);
    }
    if (request.method === 'GET' && path === `/api/customers/${customerId}`) {
      return jsonResponse(customer);
    }
    if (request.method === 'GET' && path === '/api/invoices') {
      return jsonResponse(invoicePage([]));
    }
    if ((request.method === 'POST' || request.method === 'DELETE') && lifecycle) {
      return lifecycle(request);
    }
    return undefined;
  });
}

describe('invoice lifecycle', () => {
  it('shows only the actions valid for each invoice status', async () => {
    const draft = renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      fetchImpl: detailFetch(invoiceWith('Draft')),
    });

    await screen.findByRole('heading', { level: 1, name: invoiceDetail.invoiceNumber });
    expect(screen.getByRole('link', { name: 'Edit Draft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    draft.unmount();

    const sent = renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      fetchImpl: detailFetch(invoiceWith('Sent')),
    });
    await screen.findByLabelText('Invoice status: Sent');
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit Draft' })).not.toBeInTheDocument();
    sent.unmount();
  });

  it.each(['Paid', 'Cancelled'])('%s is a read-only terminal state', async (status) => {
    renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      fetchImpl: detailFetch(invoiceWith(status)),
    });

    await screen.findByLabelText(`Invoice status: ${status}`);
    expect(screen.queryByRole('link', { name: 'Edit Draft' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Send|Mark Paid|Cancel|Delete/ }),
    ).not.toBeInTheDocument();
  });

  it('confirms Send, posts the exact token, renders the fresh token state, and invalidates lists', async () => {
    const requests: RecordedRequest[] = [];
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const sent = invoiceWith('Sent', 'AAAAAg==');
    const { user } = renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      queryClient,
      fetchImpl: detailFetch(invoiceWith('Draft'), requests, () => jsonResponse(sent)),
    });

    await screen.findByRole('button', { name: 'Send' });
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(new RegExp(invoiceDetail.invoiceNumber))).toBeInTheDocument();
    expect(within(dialog).getByText(/does not send an e-mail/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.click(within(dialog).getByRole('button', { name: 'Mark as Sent' }));
    expect(await screen.findByLabelText('Invoice status: Sent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeInTheDocument();
    expect(
      queryClient.getQueryData<Invoice>(invoiceKeys.detail(testUser.id, invoiceId))
        ?.concurrencyToken,
    ).toBe('AAAAAg==');

    const request = requests.find((candidate) => candidate.method === 'POST');
    expect(requestPath(request as RecordedRequest)).toBe(`/api/invoices/${invoiceId}/send`);
    expect(JSON.parse(request?.body ?? '{}')).toEqual({ concurrencyToken: 'AAAAAQ==' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: invoiceKeys.lists(testUser.id) });
  });

  it('supports Sent to Paid and sends the exact latest token', async () => {
    const requests: RecordedRequest[] = [];
    const paid = invoiceWith('Paid', 'AAAAAw==');
    const { user } = renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      fetchImpl: detailFetch(invoiceWith('Sent', 'AAAAAg=='), requests, () => jsonResponse(paid)),
    });

    await screen.findByRole('button', { name: 'Mark Paid' });
    await user.click(screen.getByRole('button', { name: 'Mark Paid' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/not payment processing/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Mark as Paid' }));

    expect(await screen.findByLabelText('Invoice status: Paid')).toBeInTheDocument();
    const request = requests.find((candidate) => candidate.method === 'POST');
    expect(requestPath(request as RecordedRequest)).toBe(`/api/invoices/${invoiceId}/mark-paid`);
    expect(JSON.parse(request?.body ?? '{}')).toEqual({ concurrencyToken: 'AAAAAg==' });
  });

  it.each(['Draft', 'Sent'])('confirms and completes %s to Cancelled', async (status) => {
    const requests: RecordedRequest[] = [];
    const { user } = renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      fetchImpl: detailFetch(invoiceWith(status), requests, () =>
        jsonResponse(invoiceWith('Cancelled', 'AAAABA==')),
      ),
    });

    await screen.findByRole('button', { name: 'Cancel' });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel invoice' }));

    expect(await screen.findByLabelText('Invoice status: Cancelled')).toBeInTheDocument();
    expect(
      requestPath(requests.find((request) => request.method === 'POST') as RecordedRequest),
    ).toBe(`/api/invoices/${invoiceId}/cancel`);
  });

  it('cancels a confirmation without issuing a mutation and restores focus', async () => {
    const requests: RecordedRequest[] = [];
    const { user } = renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      fetchImpl: detailFetch(invoiceWith('Draft'), requests),
    });

    const sendButton = await screen.findByRole('button', { name: 'Send' });
    await user.click(sendButton);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sendButton).toHaveFocus();
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it('deletes a Draft with an encoded concurrency query and returns to the preserved list', async () => {
    const requests: RecordedRequest[] = [];
    const { user, router } = renderApp({
      initialEntries: [
        {
          pathname: `/invoices/${invoiceId}`,
          state: { fromList: '/invoices?status=Draft&pageNumber=2' },
        } as unknown as string,
      ],
      fetchImpl: detailFetch(
        invoiceWith('Draft', 'token+/='),
        requests,
        () => new Response(null, { status: 204 }),
      ),
    });

    await screen.findByRole('button', { name: 'Delete' });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/customer will remain/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete invoice' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/invoices'));
    expect(router.state.location.search).toBe('?status=Draft&pageNumber=2');
    const request = requests.find((candidate) => candidate.method === 'DELETE');
    expect(requestPath(request as RecordedRequest)).toBe(`/api/invoices/${invoiceId}`);
    expect(requestSearch(request as RecordedRequest).get('concurrencyToken')).toBe('token+/=');
  });

  it('keeps a 409 conflict safe and reloads authoritative state before another action', async () => {
    const requests: RecordedRequest[] = [];
    let detailReads = 0;
    const fetchImpl = createFetchMock((request) => {
      requests.push(request);
      const path = requestPath(request);
      if (request.method === 'GET' && path === `/api/invoices/${invoiceId}`) {
        detailReads += 1;
        return jsonResponse(
          detailReads === 1 ? invoiceWith('Draft') : invoiceWith('Sent', 'AAAAAg=='),
        );
      }
      if (request.method === 'GET' && path === `/api/customers/${customerId}`)
        return jsonResponse(customer);
      if (request.method === 'POST') {
        return problemResponse(
          {
            title: 'Conflict',
            status: 409,
            detail:
              'The concurrency token is stale. Retrieve the invoice again and retry with the latest token.',
          },
          409,
        );
      }
      return undefined;
    });
    const { user } = renderApp({ initialEntries: [`/invoices/${invoiceId}`], fetchImpl });

    await screen.findByRole('button', { name: 'Send' });
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Mark as Sent' }));

    expect(await within(dialog).findByText(/concurrency token is stale/i)).toBeInTheDocument();
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: 'Reload Latest Invoice' }));
    expect(await screen.findByLabelText('Invoice status: Sent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark Paid' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
  });

  it('prevents double submission while a lifecycle request is pending', async () => {
    const pending = deferred<Response>();
    const requests: RecordedRequest[] = [];
    const { user } = renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      fetchImpl: detailFetch(invoiceWith('Draft'), requests, () => pending.promise),
    });

    await screen.findByRole('button', { name: 'Send' });
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Mark as Sent' }));
    const pendingButton = await within(dialog).findByRole('button', { name: 'Sending…' });
    expect(pendingButton).toBeDisabled();
    await user.click(pendingButton);
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1);

    await act(async () => pending.resolve(jsonResponse(invoiceWith('Sent', 'AAAAAg=='))));
    expect(await screen.findByLabelText('Invoice status: Sent')).toBeInTheDocument();
  });

  it.each([
    [404, 'The invoice no longer exists or is no longer available to your account.'],
    [500, 'The invoice service is temporarily unavailable. No lifecycle change was confirmed.'],
  ])('keeps the dialog open for a %s API error', async (status, message) => {
    const { user } = renderApp({
      initialEntries: [`/invoices/${invoiceId}`],
      fetchImpl: detailFetch(invoiceWith('Draft'), [], () =>
        problemResponse({ title: 'Error', status }, status),
      ),
    });

    await screen.findByRole('button', { name: 'Send' });
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Mark as Sent' }));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
