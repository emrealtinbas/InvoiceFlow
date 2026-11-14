import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createFetchMock, jsonResponse, problemResponse, type RecordedRequest } from './http';
import { renderApp, testUser } from './render';

const strongPassword = 'StrongPassw0rd!';

async function fillRegistration(
  user: ReturnType<typeof renderApp>['user'],
  values: { email?: string; password?: string; confirmPassword?: string } = {},
) {
  await user.type(screen.getByLabelText('E-mail address'), values.email ?? 'new.user@example.test');
  await user.type(screen.getByLabelText('Password'), values.password ?? strongPassword);
  await user.type(
    screen.getByLabelText('Confirm password'),
    values.confirmPassword ?? values.password ?? strongPassword,
  );
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

function registrationFetch(requests: RecordedRequest[] = []) {
  return createFetchMock((request) => {
    requests.push(request);

    if (request.url.endsWith('/api/auth/register')) {
      return jsonResponse(
        {
          id: testUser.id,
          email: request.body ? JSON.parse(request.body).email : '',
          role: 'User',
        },
        { status: 201 },
      );
    }

    return undefined;
  });
}

describe('registration page', () => {
  it('validates e-mail and backend password rules without calling the API', async () => {
    const fetchMock = vi.fn();
    const { user } = renderApp({
      authenticated: false,
      initialEntries: ['/register'],
      fetchImpl: fetchMock,
    });

    await screen.findByRole('heading', { level: 1, name: 'Create your InvoiceFlow account' });
    await user.type(screen.getByLabelText('E-mail address'), 'invalid-email');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.type(screen.getByLabelText('Confirm password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Enter a valid e-mail address.')).toBeInTheDocument();
    expect(await screen.findByText('Use at least 12 characters.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires the confirmation password to match', async () => {
    const fetchMock = vi.fn();
    const { user } = renderApp({
      authenticated: false,
      initialEntries: ['/register'],
      fetchImpl: fetchMock,
    });

    await screen.findByRole('heading', { level: 1, name: 'Create your InvoiceFlow account' });
    await fillRegistration(user, { confirmPassword: 'DifferentPassw0rd!' });

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('registers, redirects to login, and does not create a session', async () => {
    const requests: RecordedRequest[] = [];
    const { router, user } = renderApp({
      authenticated: false,
      initialEntries: ['/register?returnTo=%2Finvoices'],
      fetchImpl: registrationFetch(requests),
    });

    await screen.findByRole('heading', { level: 1, name: 'Create your InvoiceFlow account' });
    await fillRegistration(user);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Account created. Sign in with your new credentials to continue.'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');

    const search = new URLSearchParams(router.state.location.search);
    expect(search.get('registered')).toBe('1');
    expect(search.get('returnTo')).toBe('/invoices');

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain('/api/auth/register');
    expect(requests[0]?.headers.get('Authorization')).toBeNull();
    expect(requests[0]?.body).toBe(
      JSON.stringify({ email: 'new.user@example.test', password: strongPassword }),
    );
    expect(screen.queryByRole('heading', { level: 1, name: 'Invoices' })).not.toBeInTheDocument();
  });

  it('maps a duplicate e-mail conflict onto the email field', async () => {
    const fetchMock = createFetchMock((request) => {
      if (request.url.endsWith('/api/auth/register')) {
        return problemResponse(
          {
            title: 'Conflict',
            status: 409,
            detail: 'An account with this e-mail address already exists.',
            correlationId: 'register-conflict',
          },
          409,
        );
      }

      return undefined;
    });
    const { user } = renderApp({
      authenticated: false,
      initialEntries: ['/register'],
      fetchImpl: fetchMock,
    });

    await screen.findByRole('heading', { level: 1, name: 'Create your InvoiceFlow account' });
    await fillRegistration(user);

    expect(
      await screen.findByText('An account with this e-mail address already exists.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Use a different e-mail address or sign in instead.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Reference: register-conflict')).toBeInTheDocument();
  });

  it('maps Identity password codes onto the password field', async () => {
    const fetchMock = createFetchMock((request) => {
      if (request.url.endsWith('/api/auth/register')) {
        return problemResponse(
          {
            title: 'One or more validation errors occurred.',
            status: 400,
            errors: {
              PasswordTooShort: ['Passwords must be at least 12 characters.'],
            },
          },
          400,
        );
      }

      return undefined;
    });
    const { user } = renderApp({
      authenticated: false,
      initialEntries: ['/register'],
      fetchImpl: fetchMock,
    });

    await screen.findByRole('heading', { level: 1, name: 'Create your InvoiceFlow account' });
    await fillRegistration(user);

    expect(
      await screen.findByText('Passwords must be at least 12 characters.'),
    ).toBeInTheDocument();
  });

  it('handles registration rate limiting', async () => {
    const fetchMock = createFetchMock((request) => {
      if (request.url.endsWith('/api/auth/register')) {
        return problemResponse({ title: 'Too Many Requests', status: 429 }, 429, {
          'Retry-After': '45',
        });
      }

      return undefined;
    });
    const { user } = renderApp({
      authenticated: false,
      initialEntries: ['/register'],
      fetchImpl: fetchMock,
    });

    await screen.findByRole('heading', { level: 1, name: 'Create your InvoiceFlow account' });
    await fillRegistration(user);

    expect(
      await screen.findByText('Too many attempts. Try again in 45 seconds.'),
    ).toBeInTheDocument();
  });
});
