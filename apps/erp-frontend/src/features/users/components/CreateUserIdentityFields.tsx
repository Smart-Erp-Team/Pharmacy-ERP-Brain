import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { Alert } from '../../../components/ui/Alert';
import { Input } from '../../../components/ui/Input';
import { Select, type SelectOption } from '../../../components/ui/Select';
import type { Employee } from '../../../features/employees';
import type { DirectoryQueryStatus } from '../hooks/useUsersPageState';
import {
  MAX_PASSWORD_LENGTH,
  MAX_USERNAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  type CreateUserFormValues,
} from '../schemas/userSchema';

export interface CreateUserIdentityFieldsProps {
  eligibleEmployees: readonly Employee[];
  employeesDirectory: DirectoryQueryStatus;
  hasNoEligibleEmployees: boolean;
  disabled: boolean;
  register: UseFormRegister<CreateUserFormValues>;
  errors: FieldErrors<CreateUserFormValues>;
}

function buildEmployeeOptions(
  employees: readonly Employee[],
  isLoading: boolean,
  isError: boolean
): SelectOption[] {
  if (isError) {
    return [{ value: '', label: 'Employee list unavailable' }];
  }
  if (isLoading) {
    return [{ value: '', label: 'Loading employees...' }];
  }
  if (employees.length === 0) {
    return [{ value: '', label: 'No eligible employees available' }];
  }
  return [
    { value: '', label: 'Select employee' },
    ...employees.map((emp) => ({
      value: emp.employee_id,
      label: `${emp.employee_no} — ${emp.full_name}`,
    })),
  ];
}

export function CreateUserIdentityFields({
  eligibleEmployees,
  employeesDirectory,
  hasNoEligibleEmployees,
  disabled,
  register,
  errors,
}: CreateUserIdentityFieldsProps) {
  const employeeOptions = buildEmployeeOptions(
    eligibleEmployees,
    employeesDirectory.isLoading,
    employeesDirectory.isError
  );

  return (
    <>
      {hasNoEligibleEmployees ? (
        <Alert variant="info" title="No eligible employees">
          All active employees already have a user account, or no active
          employees exist yet.
        </Alert>
      ) : null}

      <Select
        label="Employee"
        options={employeeOptions}
        disabled={
          disabled ||
          employeesDirectory.isLoading ||
          employeesDirectory.isError ||
          hasNoEligibleEmployees
        }
        error={errors.employee_id?.message}
        {...register('employee_id')}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Username"
          placeholder="ph.karim@medcare.test"
          maxLength={MAX_USERNAME_LENGTH}
          autoComplete="off"
          disabled={disabled}
          error={errors.username?.message}
          {...register('username')}
        />
        <Input
          type="password"
          label="Password"
          placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
          hint={`Must be at least ${MIN_PASSWORD_LENGTH} characters.`}
          maxLength={MAX_PASSWORD_LENGTH}
          autoComplete="new-password"
          disabled={disabled}
          error={errors.password?.message}
          {...register('password')}
        />
      </div>
    </>
  );
}
