import type { FieldErrors, UseFormRegisterReturn } from 'react-hook-form';
import type { AddressDto } from '../../types/api';
import { Input } from './Input';

export interface AddressFieldsProps {
  registrations: Record<keyof AddressDto, UseFormRegisterReturn>;
  errors?: FieldErrors<AddressDto>;
  disabled?: boolean;
}

/**
 * Reusable 6-field address group matching contracts AddressDto (line1, line2,
 * city, region, postal_code, country_code). Shared across Branches and Employees.
 */
export function AddressFields({
  registrations,
  errors,
  disabled = false,
}: AddressFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Input
          label="Address line 1"
          placeholder="Street address and building number"
          maxLength={200}
          disabled={disabled}
          error={errors?.line1?.message}
          {...registrations.line1}
        />
      </div>

      <div className="sm:col-span-2">
        <Input
          label="Address line 2 (optional)"
          placeholder="Floor, suite, or landmark"
          maxLength={200}
          disabled={disabled}
          error={errors?.line2?.message}
          {...registrations.line2}
        />
      </div>

      <Input
        label="City"
        placeholder="Cairo"
        maxLength={100}
        disabled={disabled}
        error={errors?.city?.message}
        {...registrations.city}
      />

      <Input
        label="Region / Governorate (optional)"
        placeholder="Cairo Governorate"
        maxLength={100}
        disabled={disabled}
        error={errors?.region?.message}
        {...registrations.region}
      />

      <Input
        label="Postal code (optional)"
        placeholder="11511"
        maxLength={20}
        disabled={disabled}
        error={errors?.postal_code?.message}
        {...registrations.postal_code}
      />

      <Input
        label="Country code"
        placeholder="EG"
        maxLength={2}
        hint="2-letter ISO code (for example EG)"
        disabled={disabled}
        error={errors?.country_code?.message}
        {...registrations.country_code}
      />
    </div>
  );
}
