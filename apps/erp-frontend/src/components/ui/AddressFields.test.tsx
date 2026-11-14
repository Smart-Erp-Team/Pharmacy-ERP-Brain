/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import type { AddressDto } from '../../types/api';
import { AddressFields } from './AddressFields';

afterEach(() => {
  cleanup();
});

interface TestFormValues {
  address: AddressDto;
}

function AddressHarness({ disabled = false }: { disabled?: boolean }) {
  const {
    register,
    formState: { errors },
  } = useForm<TestFormValues>({
    defaultValues: {
      address: {
        line1: '',
        line2: '',
        city: '',
        region: '',
        postal_code: '',
        country_code: 'EG',
      },
    },
  });

  return (
    <AddressFields
      registrations={{
        line1: register('address.line1'),
        line2: register('address.line2'),
        city: register('address.city'),
        region: register('address.region'),
        postal_code: register('address.postal_code'),
        country_code: register('address.country_code'),
      }}
      errors={errors.address}
      disabled={disabled}
    />
  );
}

describe('AddressFields', () => {
  it('renders all six AddressDto fields with country code default', () => {
    render(<AddressHarness />);

    expect(screen.getByLabelText('Address line 1')).toBeTruthy();
    expect(screen.getByLabelText('Address line 2 (optional)')).toBeTruthy();
    expect(screen.getByLabelText('City')).toBeTruthy();
    expect(
      screen.getByLabelText('Region / Governorate (optional)')
    ).toBeTruthy();
    expect(screen.getByLabelText('Postal code (optional)')).toBeTruthy();

    const country = screen.getByLabelText('Country code') as HTMLInputElement;
    expect(country.value).toBe('EG');
  });

  it('disables all six inputs when disabled is true', () => {
    render(<AddressHarness disabled />);

    expect(
      (screen.getByLabelText('Address line 1') as HTMLInputElement).disabled
    ).toBe(true);
    expect((screen.getByLabelText('City') as HTMLInputElement).disabled).toBe(
      true
    );
    expect(
      (screen.getByLabelText('Country code') as HTMLInputElement).disabled
    ).toBe(true);
  });
});
