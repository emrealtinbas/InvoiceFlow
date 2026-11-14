import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppErrorBoundary } from '@/app/providers/app-error-boundary';

let shouldThrow = true;

function UnstableComponent() {
  if (shouldThrow) {
    throw new Error('Deliberate render failure');
  }

  return <p>Recovered content</p>;
}

describe('AppErrorBoundary', () => {
  it('renders a safe fallback and can retry the render', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();

    shouldThrow = true;

    render(
      <AppErrorBoundary>
        <UnstableComponent />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText('Deliberate render failure')).toBeInTheDocument();
    expect(screen.queryByText(/stack/i)).not.toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Recovered content')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
