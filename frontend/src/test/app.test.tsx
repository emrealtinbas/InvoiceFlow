import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderApp } from './render';

describe('application rendering', () => {
  it('renders the dashboard inside the shared application shell', async () => {
    renderApp();

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'InvoiceFlow dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Financial overview')).toBeInTheDocument();
    expect(screen.getByText('Phase 10 · Release Candidate')).toBeInTheDocument();
    expect(screen.getAllByText('alex.morgan@example.test').length).toBeGreaterThan(0);
  });

  it('does not show fake customer or invoice data', async () => {
    renderApp();

    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });

    expect(screen.queryByText(/northwind/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invoice #/i)).not.toBeInTheDocument();
  });
});
