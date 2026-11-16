import type { FieldErrors } from 'react-hook-form';
import type { BranchDto, BranchScope, Role } from '../../../types/api';
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
  role: Role;
  branchScope: BranchScope;
  branchIds: readonly string[];
  isActive: boolean;
  showPreservedGrantsNotice: boolean;
  branches: readonly BranchDto[];
  branchesDirectory: DirectoryQueryStatus;
  disabled: boolean;
  errors: FieldErrors<EditUserFormValues>;
  onAccessChange: (patch: UserAccessPatch) => void;
  onStatusChange: (nextActive: boolean) => void;
}

export function EditUserFormFields({
  employeeDisplay,
  username,
  role,
  branchScope,
  branchIds,
  isActive,
  showPreservedGrantsNotice,
  branches,
  branchesDirectory,
  disabled,
  errors,
  onAccessChange,
  onStatusChange,
}: EditUserFormFieldsProps) {
  return (
    <>
      <EditUserIdentityFields
        employeeDisplay={employeeDisplay}
        username={username}
      />
      <UserFormFields
        role={role}
        branchScope={branchScope}
        branchIds={branchIds}
        branches={branches}
        branchesDirectory={branchesDirectory}
        disabled={disabled}
        roleError={errors.role?.message}
        branchScopeError={errors.branch_scope?.message}
        branchIdsError={errors.branch_ids?.message}
        showPreservedGrantsNotice={showPreservedGrantsNotice}
        onAccessChange={onAccessChange}
      />
      <EditUserStatusField
        isActive={isActive}
        disabled={disabled}
        error={errors.is_active?.message}
        onChange={onStatusChange}
      />
    </>
  );
}
