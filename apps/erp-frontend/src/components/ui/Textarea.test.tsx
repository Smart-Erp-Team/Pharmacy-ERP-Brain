/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Textarea } from './Textarea';

afterEach(() => {
  cleanup();
});

describe('Textarea', () => {
  it('renders the label and the hint', () => {
    render(<Textarea label="Description" hint="Shown under the category" />);

    const textarea = screen.getByLabelText('Description');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('links the error message to the control', () => {
    render(
      <Textarea label="Notes" error="Notes are required" hint="Optional" />
    );

    const textarea = screen.getByLabelText('Notes');
    expect(textarea.getAttribute('aria-invalid')).toBe('true');

    const describedBy = textarea.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')).not.toBeNull();
    expect(screen.getByRole('alert').textContent).toBe('Notes are required');
  });
});
