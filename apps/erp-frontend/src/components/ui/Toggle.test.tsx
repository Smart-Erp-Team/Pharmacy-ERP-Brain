/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toggle } from './Toggle';

afterEach(() => {
  cleanup();
});

describe('Toggle', () => {
  it('reports its state with aria-checked', () => {
    render(<Toggle label="Active" checked onChange={() => undefined} />);

    expect(screen.getByRole('switch', { name: 'Active' })).toHaveProperty(
      'ariaChecked',
      'true'
    );
  });

  it('reports the new value when it is switched', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Toggle label="Sellable" checked={false} onChange={onChange} />);

    await user.click(screen.getByRole('switch', { name: 'Sellable' }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not switch while it is disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Toggle label="Lot tracking" checked onChange={onChange} disabled />
    );

    await user.click(screen.getByRole('switch', { name: 'Lot tracking' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
