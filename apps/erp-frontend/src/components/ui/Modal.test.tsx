/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Modal } from './Modal';

afterEach(() => {
  cleanup();
});

function ModalHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit branch">
        <input aria-label="Branch name" />
        <button type="button">Save</button>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('renders an accessible dialog with the title as its accessible name', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole('button', { name: 'Open dialog' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(
      document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')
    ).not.toBeNull();
  });

  it('moves the focus inside the dialog when it opens', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole('button', { name: 'Open dialog' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('traps the focus inside the dialog', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole('button', { name: 'Open dialog' }));

    const saveButton = screen.getByRole('button', { name: 'Save' });
    saveButton.focus();
    await user.tab();

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close dialog' })
    );
  });

  it('closes on the Escape key and returns the focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(trigger);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
