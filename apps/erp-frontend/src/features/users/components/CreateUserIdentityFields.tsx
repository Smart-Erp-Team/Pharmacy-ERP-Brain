import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { EmployeeDto } from '../../../features/employees';
import { Alert } from '../../../components/ui/Alert';
import { Input } from '../../../components/ui/Input';
import { Select, type SelectOption } from '../../../components/ui/Select';
import type { DirectoryQueryStatus } from '../hooks/useUsersPageState';
import type { CreateUserFormValues } from '../schemas/userSchema';

export interface CreateUserIdentityFieldsProps {
  eligibleEmployees: readonly EmployeeDto[];
  employeesDirectory: DirectoryQueryStatus;
  hasNoEligibleEmployees: boolean;
  disabled: boolean;
  register: UseFormRegister<CreateUserFormValues>;
  errors: FieldErrors<CreateUserFormValues>;
}

function buildEmployeeOptions(
  employees: readonly EmployeeDto[],
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
          placeholder="ph.youssef"
          maxLength={80}
          autoComplete="off"
          disabled={disabled}
          error={errors.username?.message}
          {...register('username')}
        />
        <Input
          type="password"
          label="Password"
          placeholder="Minimum 8 characters"
          maxLength={128}
          autoComplete="new-password"
          disabled={disabled}
          error={errors.password?.message}
          {...register('password')}
        />
      </div>
    </>
  );
}
