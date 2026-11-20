import {
  Controller,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import { AddressFields } from '../../../components/ui/AddressFields';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Toggle } from '../../../components/ui/Toggle';
import type { BranchDto } from '../../../types/api';
import { buildEmployeeBranchOptions } from '../hooks/useEmployeeForm';
import type { EmployeeFormValues } from '../schemas/employeeSchema';

export interface EmployeeFormFieldsProps {
  isEdit: boolean;
  disabled: boolean;
  branches: readonly BranchDto[];
  isBranchesLoading: boolean;
  isBranchesError: boolean;
  currentBranchId: string;
  register: UseFormRegister<EmployeeFormValues>;
  control: Control<EmployeeFormValues>;
  errors: FieldErrors<EmployeeFormValues>;
}

export function EmployeeFormFields({
  isEdit,
  disabled,
  branches,
  isBranchesLoading,
  isBranchesError,
  currentBranchId,
  register,
  control,
  errors,
}: EmployeeFormFieldsProps) {
  const branchOptions = buildEmployeeBranchOptions(
    branches,
    isBranchesLoading,
    isBranchesError,
    isEdit,
    currentBranchId
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Home branch"
          options={branchOptions}
          disabled={disabled || isBranchesLoading}
          error={errors.branch_id?.message}
          {...register('branch_id')}
        />
        <Input
          label="Employee number"
          placeholder="EMP-001"
          maxLength={30}
          disabled={disabled}
          hint="Unique within the selected branch"
          error={errors.employee_no?.message}
          {...register('employee_no')}
        />
        <Input
          label="Full name"
          placeholder="Omar Khaled"
          maxLength={150}
          disabled={disabled}
          error={errors.full_name?.message}
          {...register('full_name')}
        />
        <Input
          label="Job title (optional)"
          placeholder="Lead Pharmacist"
          maxLength={80}
          disabled={disabled}
          error={errors.job_title?.message}
          {...register('job_title')}
        />
        <Input
          type="email"
          label="Email (optional)"
          placeholder="omar@pharmaplus.eg"
          maxLength={254}
          disabled={disabled}
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          type="tel"
          label="Phone (optional)"
          placeholder="+20 100 111 2233"
          maxLength={30}
          disabled={disabled}
          error={errors.phone?.message}
          {...register('phone')}
        />
        <div className="sm:col-span-2">
          <Input
            type="date"
            label="Hire date"
            disabled={disabled}
            error={errors.hired_on?.message}
            {...register('hired_on')}
          />
        </div>
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
            label="Active employee"
            description="Inactive employees remain in historical records and cannot be assigned active operations."
            checked={field.value}
            onChange={field.onChange}
            disabled={disabled}
          />
        )}
      />
    </>
  );
}
