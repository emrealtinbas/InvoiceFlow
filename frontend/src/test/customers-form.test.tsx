import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createQueryClient } from '@/app/providers/query-client';
import { customerKeys } from '@/features/customers/api/query-keys';

import { acmeCustomer, newCustomer, otherOwnerCustomer, requestPath } from './customer-fixtures';
import {
  createFetchMock,
  deferred,
  jsonResponse,
  problemResponse,
  type RecordedRequest,
} from './http';
import { renderApp, testUser } from './render';

function customerResponse(customer = acmeCustomer, init: ResponseInit = {}) {
  return jsonResponse(customer, init);
}

describe('customer create and edit forms', () => {
  it('validates create fields with the backend constraints and does not submit invalid input', async () => {
    const fetchImpl = createFetchMock(() => undefined);
    const { user } = renderApp({ initialEntries: ['/customers/new'], fetchImpl });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'New customer' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create customer' }));

    expect(await screen.findByText('Enter a customer name.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Customer name'), 'A');
    await user.type(screen.getByLabelText('E-mail address'), 'not-an-email');
    await user.type(screen.getByLabelText('Phone'), 'call-me');
    await user.type(screen.getByLabelText('Tax number'), '123');
    await user.click(screen.getByRole('button', { name: 'Create customer' }));

    expect(
      await screen.findByText('Customer name must be at least 2 characters.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter a valid e-mail address.')).toBeInTheDocument();
    expect(
      screen.getByText("Use only digits, spaces, '+', '-', and parentheses."),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter a 10 or 11 digit tax number.')).toBeInTheDocument();
  });

  it('creates a customer, invalidates the list, and navigates to the returned id', async () => {
    const requests: RecordedRequest[] = [];
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const fetchImpl = createFetchMock((request) => {
      requests.push(request);
      const path = requestPath(request);

      if (request.method === 'POST' && path === '/api/customers') {
        return customerResponse(newCustomer, { status: 201 });
      }

      if (request.method === 'GET' && path === `/api/customers/${newCustomer.id}`) {
        return customerResponse(newCustomer);
      }

      return undefined;
    });

    const { user, router } = renderApp({
      initialEntries: ['/customers/new'],
      fetchImpl,
      queryClient,
    });

    await screen.findByRole('heading', { level: 1, name: 'New customer' });
    await user.type(screen.getByLabelText('Customer name'), newCustomer.name);
    await user.type(screen.getByLabelText('E-mail address'), newCustomer.email ?? '');
    await user.type(screen.getByLabelText('Phone'), newCustomer.phone ?? '');
    await user.type(screen.getByLabelText('Address'), newCustomer.address ?? '');
    await user.type(screen.getByLabelText('Tax number'), newCustomer.taxNumber ?? '');
    await user.click(screen.getByRole('button', { name: 'Create customer' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: newCustomer.name }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/customers/${newCustomer.id}`);
    expect(await screen.findByText('Customer created.')).toBeInTheDocument();

    const post = requests.find((request) => request.method === 'POST');
    expect(post).toBeDefined();
    expect(requestPath(post as RecordedRequest)).toBe('/api/customers');
    expect((post as RecordedRequest).headers.get('Authorization')).toBe('Bearer test-access-token');
    expect(JSON.parse((post as RecordedRequest).body ?? '')).toEqual({
      name: newCustomer.name,
      email: newCustomer.email,
      phone: newCustomer.phone,
      address: newCustomer.address,
      taxNumber: newCustomer.taxNumber,
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: customerKeys.lists(testUser.id) });
  });

  it('maps duplicate e-mail conflicts onto the form without losing input', async () => {
    const requests: RecordedRequest[] = [];
    const fetchImpl = createFetchMock((request) => {
      requests.push(request);

      if (request.method === 'POST' && requestPath(request) === '/api/customers') {
        return problemResponse(
          {
            title: 'Conflict',
            status: 409,
            detail: 'A customer with this e-mail address already exists.',
          },
          409,
        );
      }

      return undefined;
    });

    const { user, router } = renderApp({ initialEntries: ['/customers/new'], fetchImpl });

    await screen.findByRole('heading', { level: 1, name: 'New customer' });
    const name = screen.getByLabelText('Customer name');
    const email = screen.getByLabelText('E-mail address');
    await user.type(name, 'Duplicate Customer');
    await user.type(email, 'billing@acme.test');
    await user.click(screen.getByRole('button', { name: 'Create customer' }));

    expect(
      await screen.findByText('A customer with this e-mail address already exists.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Use a different e-mail address for this customer.'),
    ).toBeInTheDocument();
    expect(name).toHaveValue('Duplicate Customer');
    expect(email).toHaveValue('billing@acme.test');
    expect(router.state.location.pathname).toBe('/customers/new');
    expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1);
  });

  it('maps server validation errors to fields and focuses the first invalid field', async () => {
    const fetchImpl = createFetchMock((request) => {
      if (request.method !== 'POST' || requestPath(request) !== '/api/customers') {
        return undefined;
      }

      return problemResponse(
        {
          title: 'One or more validation errors occurred.',
          status: 400,
          detail: 'The request could not be validated.',
          errors: {
            Name: ['The Name field must be between 2 and 200 characters.'],
            Email: ['The Email field is not a valid e-mail address.'],
          },
        },
        400,
      );
    });

    const { user } = renderApp({ initialEntries: ['/customers/new'], fetchImpl });

    await screen.findByRole('heading', { level: 1, name: 'New customer' });
    await user.type(screen.getByLabelText('Customer name'), 'Valid Name');
    await user.type(screen.getByLabelText('E-mail address'), 'valid@example.test');
    await user.click(screen.getByRole('button', { name: 'Create customer' }));

    expect(
      await screen.findByText('The Name field must be between 2 and 200 characters.'),
    ).toBeInTheDocument();
    expect(screen.getByText('The Email field is not a valid e-mail address.')).toBeInTheDocument();
    expect(screen.getByText('Check the highlighted fields and try again.')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByLabelText('Customer name')).toHaveFocus());
  });

  it('prevents duplicate create submissions while the first is pending', async () => {
    const pending = deferred<Response>();
    let postCount = 0;
    const fetchImpl = createFetchMock((request) => {
      if (request.method === 'POST' && requestPath(request) === '/api/customers') {
        postCount += 1;
        return pending.promise;
      }

      if (request.method === 'GET' && requestPath(request) === `/api/customers/${newCustomer.id}`) {
        return customerResponse(newCustomer);
      }

      return undefined;
    });

    const { user } = renderApp({ initialEntries: ['/customers/new'], fetchImpl });

    await screen.findByRole('heading', { level: 1, name: 'New customer' });
    await user.type(screen.getByLabelText('Customer name'), newCustomer.name);

    const submit = screen.getByRole('button', { name: 'Create customer' });
    await user.click(submit);

    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Creating…' }));
    expect(postCount).toBe(1);

    await act(async () => {
      pending.resolve(customerResponse(newCustomer, { status: 201 }));
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: newCustomer.name }),
    ).toBeInTheDocument();
  });

  it('shows customer details from the API with edit and delete actions', async () => {
    const fetchImpl = createFetchMock((request) => {
      if (
        request.method === 'GET' &&
        requestPath(request) === `/api/customers/${acmeCustomer.id}`
      ) {
        return customerResponse();
      }

      return undefined;
    });

    renderApp({ initialEntries: [`/customers/${acmeCustomer.id}`], fetchImpl });

    expect(
      await screen.findByRole('heading', { level: 1, name: acmeCustomer.name }),
    ).toBeInTheDocument();
    expect(screen.getByText(acmeCustomer.email ?? '')).toBeInTheDocument();
    expect(screen.getByText(acmeCustomer.phone ?? '')).toBeInTheDocument();
    expect(screen.getByText(acmeCustomer.address ?? '')).toBeInTheDocument();
    expect(screen.getByText(acmeCustomer.taxNumber ?? '')).toBeInTheDocument();
    expect(screen.getByText('Never updated')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      `/customers/${acmeCustomer.id}/edit`,
    );
    expect(screen.getByRole('button', { name: `Delete ${acmeCustomer.name}` })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to customers' })).toHaveAttribute(
      'href',
      '/customers',
    );
  });

  it.each([acmeCustomer.id, otherOwnerCustomer.id])(
    'shows the same generic not-found state for missing or cross-owner customer %s',
    async (id) => {
      const fetchImpl = createFetchMock((request) => {
        if (request.method === 'GET' && requestPath(request) === `/api/customers/${id}`) {
          return problemResponse(
            {
              title: 'Not Found',
              status: 404,
              detail: 'The customer was not found.',
            },
            404,
          );
        }

        return undefined;
      });

      renderApp({ initialEntries: [`/customers/${id}`], fetchImpl });

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Customer not found' }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'It may have been deleted, or it may belong to another account. InvoiceFlow does not reveal which.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(otherOwnerCustomer.name)).not.toBeInTheDocument();
    },
  );

  it('edits a customer with a full PUT replacement and invalidates customer queries', async () => {
    const updated = {
      ...acmeCustomer,
      name: 'Acme Updated',
      phone: null,
      address: null,
      updatedAt: '2026-11-13T15:00:00.000Z',
    };
    const requests: RecordedRequest[] = [];
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    let saved = false;
    const fetchImpl = createFetchMock((request) => {
      requests.push(request);
      const path = requestPath(request);

      if (request.method === 'GET' && path === `/api/customers/${acmeCustomer.id}`) {
        return customerResponse(saved ? updated : acmeCustomer);
      }

      if (request.method === 'PUT' && path === `/api/customers/${acmeCustomer.id}`) {
        saved = true;
        return customerResponse(updated);
      }

      return undefined;
    });

    const { user, router } = renderApp({
      initialEntries: [`/customers/${acmeCustomer.id}/edit`],
      fetchImpl,
      queryClient,
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Edit customer' }),
    ).toBeInTheDocument();

    const name = await screen.findByLabelText('Customer name');
    const phone = screen.getByLabelText('Phone');
    const address = screen.getByLabelText('Address');
    expect(name).toHaveValue(acmeCustomer.name);

    await user.clear(name);
    await user.type(name, 'Acme Updated');
    await user.clear(phone);
    await user.clear(address);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Acme Updated' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/customers/${acmeCustomer.id}`);
    expect(await screen.findByText('Customer updated.')).toBeInTheDocument();

    const put = requests.find((request) => request.method === 'PUT');
    expect(put).toBeDefined();
    expect(JSON.parse((put as RecordedRequest).body ?? '')).toEqual({
      name: 'Acme Updated',
      email: acmeCustomer.email,
      phone: null,
      address: null,
      taxNumber: acmeCustomer.taxNumber,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: customerKeys.all(testUser.id) });
  });

  it('keeps edit input and shows a field error on a duplicate e-mail conflict', async () => {
    const fetchImpl = createFetchMock((request) => {
      const path = requestPath(request);

      if (request.method === 'GET' && path === `/api/customers/${acmeCustomer.id}`) {
        return customerResponse();
      }

      if (request.method === 'PUT' && path === `/api/customers/${acmeCustomer.id}`) {
        return problemResponse(
          {
            title: 'Conflict',
            status: 409,
            detail: 'A customer with this e-mail address already exists.',
          },
          409,
        );
      }

      return undefined;
    });

    const { user, router } = renderApp({
      initialEntries: [`/customers/${acmeCustomer.id}/edit`],
      fetchImpl,
    });

    await screen.findByRole('heading', { level: 1, name: 'Edit customer' });
    const email = await screen.findByLabelText('E-mail address');
    await user.clear(email);
    await user.type(email, 'taken@example.test');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('A customer with this e-mail address already exists.'),
    ).toBeInTheDocument();
    expect(email).toHaveValue('taken@example.test');
    expect(router.state.location.pathname).toBe(`/customers/${acmeCustomer.id}/edit`);
  });
});
