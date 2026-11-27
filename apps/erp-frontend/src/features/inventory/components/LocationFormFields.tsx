import type { ComponentPropsWithRef } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Toggle } from '../../../components/ui/Toggle';
import type { LocationType } from '../../../types/api';
import {
  isSellableAllowedForLocationType,
  LOCATION_TYPES,
} from '../schemas/inventoryLocationSchema';

const LOCATION_TYPE_OPTIONS = LOCATION_TYPES.map((t) => ({
  value: t,
  label: t,
}));

export interface LocationFormFieldErrors {
  location_code?: string;
  name?: string;
  location_type?: string;
  is_sellable?: string;
  is_active?: string;
}

export interface LocationFormFieldsProps {
  isEdit: boolean;
  locationCode?: string;
  locationType: LocationType;
  codeInputProps?: ComponentPropsWithRef<'input'>;
  nameInputProps: ComponentPropsWithRef<'input'>;
  locationTypeSelectProps?: ComponentPropsWithRef<'select'>;
  isSellable: boolean;
  onIsSellableChange: (checked: boolean) => void;
  isActive?: boolean;
  onIsActiveChange?: (checked: boolean) => void;
  errors: LocationFormFieldErrors;
  disabled: boolean;
}

export function LocationFormFields({
  isEdit,
  locationCode,
  locationType,
  codeInputProps,
  nameInputProps,
  locationTypeSelectProps,
  isSellable,
  onIsSellableChange,
  isActive = true,
  onIsActiveChange,
  errors,
  disabled,
}: LocationFormFieldsProps) {
  const canBeSellable = isSellableAllowedForLocationType(locationType);
  const sellableDescription = canBeSellable
    ? 'Allow stock in this location to count toward sellable availability.'
    : 'Locked to non-sellable for QUARANTINE, DAMAGED, and SCRAP locations.';

  return (
    <div className="flex flex-col gap-4">
      {isEdit ? (
        <div className="border-border bg-background grid grid-cols-1 gap-3 rounded-md border px-3 py-2.5 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-caption text-text-muted font-semibold uppercase">
                Location code
              </p>
              <p className="text-body text-text font-mono font-semibold">
                {locationCode ?? 'Unavailable'}
              </p>
            </div>
            <Badge variant="neutral">Read-only</Badge>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-caption text-text-muted font-semibold uppercase">
                Location type
              </p>
              <p className="text-body text-text font-semibold">
                {locationType}
              </p>
            </div>
            <Badge variant="neutral">Immutable</Badge>
          </div>
        </div>
      ) : (
        <Input
          label="Location code"
          placeholder="MAIN-SELLABLE"
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
      {!isEdit ? (
        <Select
          label="Location type"
          options={LOCATION_TYPE_OPTIONS}
          disabled={disabled}
          error={errors.location_type}
          hint="Only SELLABLE locations can be marked as sellable. QUARANTINE, DAMAGED, and SCRAP are locked non-sellable."
          {...locationTypeSelectProps}
        />
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Toggle
          label="Sellable location"
          description={sellableDescription}
          checked={canBeSellable ? isSellable : false}
          onChange={onIsSellableChange}
          disabled={disabled || !canBeSellable}
        />
        {errors.is_sellable ? (
          <p role="alert" className="text-body-sm text-danger font-medium">
            {errors.is_sellable}
          </p>
        ) : null}
      </div>
      {isEdit && onIsActiveChange ? (
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
      ) : null}
    </div>
  );
}
