/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';

afterEach(() => {
  cleanup();
});

describe('EmptyState', () => {
  it('shows the title, the helper line and the recovery action', () => {
    render(
      <EmptyState
        title="No branches yet"
        description="Create the first branch to start enrolling devices."
        action={<button type="button">Add branch</button>}
      />
    );

    expect(screen.getByText('No branches yet')).toBeDefined();
    expect(
      screen.getByText('Create the first branch to start enrolling devices.')
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add branch' })).toBeDefined();
  });
});

describe('Skeleton', () => {
  it('renders a decorative placeholder for the loading state', () => {
    const { container } = render(<Skeleton className="h-4 w-40" />);

    const placeholder = container.firstElementChild;
    expect(placeholder?.getAttribute('aria-hidden')).toBe('true');
    expect(placeholder?.className).toContain('h-4');
  });
});
