import type { ComponentPropsWithRef } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Toggle } from '../../../components/ui/Toggle';
import { LOCATION_TYPES } from '../schemas/inventoryLocationSchema';

export interface LocationFormFieldErrors {
  location_code?: string;
  name?: string;
  location_type?: string;
  is_active?: string;
}

export interface LocationFormFieldsProps {
  isEdit: boolean;
  locationCode?: string;
  codeInputProps?: ComponentPropsWithRef<'input'>;
  nameInputProps: ComponentPropsWithRef<'input'>;
  locationTypeSelectProps: ComponentPropsWithRef<'select'>;
  isActive: boolean;
  onIsActiveChange: (checked: boolean) => void;
  errors: LocationFormFieldErrors;
  disabled: boolean;
}

const LOCATION_TYPE_OPTIONS = LOCATION_TYPES.map((type) => ({
  value: type,
  label: type,
}));

export function LocationFormFields({
  isEdit,
  locationCode,
  codeInputProps,
  nameInputProps,
  locationTypeSelectProps,
  isActive,
  onIsActiveChange,
  errors,
  disabled,
}: LocationFormFieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      {isEdit ? (
        <div className="border-border bg-background flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-caption text-text-muted font-semibold uppercase">
              Location code
            </span>
            <span className="text-body text-text font-mono font-semibold">
              {locationCode ?? 'Unavailable'}
            </span>
          </div>
          <Badge variant="neutral">Read-only</Badge>
        </div>
      ) : (
        <Input
          label="Location code"
          placeholder="MAIN-SELL"
          maxLength={30}
          disabled={disabled}
          error={errors.location_code}
          {...codeInputProps}
        />
      )}

      <Input
        label="Location name"
        placeholder="Main Pharmacy Shelf"
        maxLength={100}
        disabled={disabled}
        error={errors.name}
        {...nameInputProps}
      />

      <Select
        label="Location type"
        options={LOCATION_TYPE_OPTIONS}
        disabled={disabled}
        error={errors.location_type}
        hint="Sellable status is derived automatically by the server (SELLABLE = sellable, QUARANTINE / SCRAP = non-sellable)."
        {...locationTypeSelectProps}
      />

      <div className="flex flex-col gap-1.5">
        <Toggle
          label="Active location"
          description="Inactive locations cannot be used for new sellable stock availability."
          checked={isActive}
          onChange={onIsActiveChange}
          disabled={disabled}
        />
        {errors.is_active ? (
          <p role="alert" className="text-body-sm text-danger font-medium">
            {errors.is_active}
          </p>
        ) : null}
      </div>
    </div>
  );
}
