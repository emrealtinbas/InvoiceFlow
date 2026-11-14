import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderApp } from './render';

describe('shared layout', () => {
  it('provides a skip link that targets the main content region', async () => {
    renderApp();

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });

    const skipLink = screen.getByRole('link', { name: 'Skip to content' });
    const main = document.querySelector('#main-content');

    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(main).not.toBeNull();
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('marks the active navigation item with aria-current', async () => {
    renderApp();

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Customers' })).not.toHaveAttribute('aria-current');
  });

  it('shows the configured API target without presenting a live connection', async () => {
    renderApp();

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });

    const target = screen.getByTitle('http://localhost:8080');

    expect(target).toHaveTextContent('http://localhost:8080');
    expect(target).not.toHaveAttribute('contenteditable');
    expect(screen.getByText(/not a live connection check/i)).toBeInTheDocument();
  });

  it('opens the responsive navigation dialog and navigates from it', async () => {
    const { router, user } = renderApp();

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('Navigation')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('link', { name: 'Customers' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Customers' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/customers');
  });

  it('moves focus to the main region after client-side route navigation', async () => {
    const { user } = renderApp();

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await user.click(screen.getByRole('link', { name: 'Customers' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Customers' })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('#main-content')).toHaveFocus());
  });

  it('signs out from the authenticated shell and returns to login', async () => {
    const { router, user } = renderApp();

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(
      screen.getByText('You have signed out. Sign in again when you are ready.'),
    ).toBeInTheDocument();
  });

  it('exposes an accessible sign-out action inside the mobile navigation dialog', async () => {
    const { router, user } = renderApp();

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));

    const dialog = await screen.findByRole('dialog');
    const signOut = within(dialog).getByRole('button', { name: 'Sign out' });

    expect(signOut).toBeEnabled();

    await user.click(signOut);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to InvoiceFlow' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });
});
