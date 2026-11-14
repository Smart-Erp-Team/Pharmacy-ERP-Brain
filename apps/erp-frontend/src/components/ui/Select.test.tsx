/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Select } from './Select';

afterEach(() => {
  cleanup();
});

describe('Select', () => {
  it('renders the label and the options', () => {
    render(<Select label="City" options={['Cairo', 'Giza']} />);

    const select = screen.getByLabelText('City') as HTMLSelectElement;
    expect(select.options).toHaveLength(2);
    expect(select.options[0].textContent).toBe('Cairo');
  });

  it('renders value/label option objects', () => {
    render(
      <Select
        label="Branch"
        options={[
          { value: 'b1', label: 'Cairo Main (CAI-01)' },
          { value: 'b2', label: 'Alexandria (ALX-01)' },
        ]}
      />
    );

    const select = screen.getByLabelText('Branch') as HTMLSelectElement;
    expect(select.options).toHaveLength(2);
    expect(select.options[0].value).toBe('b1');
    expect(select.options[0].textContent).toBe('Cairo Main (CAI-01)');
    expect(select.options[1].value).toBe('b2');
  });

  it('links the error message to the control', () => {
    render(
      <Select
        label="City"
        options={['Cairo']}
        error="City is required"
        hint="Use the governorate name"
      />
    );

    const select = screen.getByLabelText('City');
    expect(select.getAttribute('aria-invalid')).toBe('true');

    const describedBy = select.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')).not.toBeNull();

    expect(screen.getByRole('alert').textContent).toBe('City is required');
  });

  it('describes the control with the hint when there is no error', () => {
    render(
      <Select
        label="City"
        options={['Cairo']}
        hint="Use the governorate name"
      />
    );

    const select = screen.getByLabelText('City');
    expect(select.getAttribute('aria-invalid')).toBeNull();
    expect(select.getAttribute('aria-describedby')).toBeTruthy();
  });
});
