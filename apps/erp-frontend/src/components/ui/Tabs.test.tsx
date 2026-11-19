/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs } from './Tabs';

afterEach(() => {
  cleanup();
});

describe('Tabs', () => {
  it('marks the active tab as selected', () => {
    render(
      <Tabs
        labels={['Stock Overview', 'Stock Balances & Batches']}
        activeLabel="Stock Overview"
        onChange={() => undefined}
      />
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
  });

  it('reports the clicked tab', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Tabs
        labels={['Stock Overview', 'Stock Balances & Batches']}
        activeLabel="Stock Overview"
        onChange={onChange}
      />
    );

    await user.click(
      screen.getByRole('tab', { name: 'Stock Balances & Batches' })
    );

    expect(onChange).toHaveBeenCalledWith('Stock Balances & Batches');
  });
});
