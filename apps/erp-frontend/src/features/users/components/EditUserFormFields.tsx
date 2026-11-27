import type { FieldErrors } from 'react-hook-form';
import { Alert } from '../../../components/ui/Alert';
import type { Branch } from '../../../features/branches';
import type {
  DirectoryQueryStatus,
  EmployeeDisplay,
} from '../hooks/useUsersPageState';
import type { EditUserFormValues } from '../schemas/userSchema';
import { EditUserIdentityFields } from './EditUserIdentityFields';
import { EditUserStatusField } from './EditUserStatusField';
import { UserFormFields, type UserAccessPatch } from './UserFormFields';

export interface EditUserFormFieldsProps {
  employeeDisplay: EmployeeDisplay;
  username: string;
  values: EditUserFormValues;
  isSelf: boolean;
  branches: readonly Branch[];
  branchesDirectory: DirectoryQueryStatus;
  disabled: boolean;
  errors: FieldErrors<EditUserFormValues>;
  onAccessChange: (patch: UserAccessPatch) => void;
  onStatusChange: (nextActive: boolean) => void;
}

export function EditUserFormFields({
  employeeDisplay,
  username,
  values,
  isSelf,
  branches,
  branchesDirectory,
  disabled,
  errors,
  onAccessChange,
  onStatusChange,
}: EditUserFormFieldsProps) {
  return (
    <>
      {isSelf ? (
        <Alert variant="info" title="Self-account protection">
          You cannot change your own role, branch scope, or active status.
        </Alert>
      ) : null}
      <EditUserIdentityFields
        employeeDisplay={employeeDisplay}
        username={username}
      />
      <UserFormFields
        role={values.role}
        branchScope={values.branch_scope}
        branchIds={values.branch_ids}
        branches={branches}
        branchesDirectory={branchesDirectory}
        disabled={disabled}
        lockRoleAndScope={isSelf}
        roleError={errors.role?.message}
        branchScopeError={errors.branch_scope?.message}
        branchIdsError={errors.branch_ids?.message}
        onAccessChange={onAccessChange}
      />
      <EditUserStatusField
        isActive={values.is_active}
        disabled={disabled || isSelf}
        error={errors.is_active?.message}
        onChange={onStatusChange}
      />
    </>
  );
}
