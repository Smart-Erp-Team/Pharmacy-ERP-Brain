import {
  Controller,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import { AddressFields } from '../../../components/ui/AddressFields';
import { Input } from '../../../components/ui/Input';
import { Toggle } from '../../../components/ui/Toggle';
import type { BranchFormValues } from '../schemas/branchSchema';

export interface BranchFormFieldsProps {
  isEdit: boolean;
  disabled: boolean;
  register: UseFormRegister<BranchFormValues>;
  control: Control<BranchFormValues>;
  errors: FieldErrors<BranchFormValues>;
}

export function BranchFormFields({
  isEdit,
  disabled,
  register,
  control,
  errors,
}: BranchFormFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Branch code"
          placeholder="CAI-01"
          maxLength={30}
          disabled={isEdit || disabled}
          hint={
            isEdit
              ? 'Branch code is permanent once created.'
              : 'Unique code up to 30 characters'
          }
          error={errors.code?.message}
          {...register('code')}
        />
        <Input
          label="Branch name"
          placeholder="Cairo Main Branch"
          maxLength={150}
          disabled={disabled}
          error={errors.name?.message}
          {...register('name')}
        />
      </div>

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

      <Controller
        name="is_active"
        control={control}
        render={({ field }) => (
          <Toggle
            label="Active branch"
            description="Inactive branches remain in historical records but cannot enroll new terminals."
            checked={field.value}
            onChange={field.onChange}
            disabled={disabled}
          />
        )}
      />
    </>
  );
}
