import { Select } from '../../../components/ui/Select';
import type { Branch } from '../../../features/branches';
import type { BranchScope, UserRole } from '../../../types/api';
import type { DirectoryQueryStatus } from '../hooks/useUsersPageState';
import { BRANCH_SCOPES, USER_ROLES } from '../schemas/userSchema';
import { BranchAccessSelector } from './BranchAccessSelector';

export interface UserAccessPatch {
  role?: UserRole;
  branch_scope?: BranchScope;
  branch_ids?: string[];
}

export interface UserFormFieldsProps {
  role: UserRole;
  branchScope: BranchScope;
  branchIds: readonly string[];
  branches: readonly Branch[];
  branchesDirectory: DirectoryQueryStatus;
  disabled: boolean;
  lockRoleAndScope?: boolean;
  roleError?: string;
  branchScopeError?: string;
  branchIdsError?: string;
  onAccessChange: (patch: UserAccessPatch) => void;
}

const ROLE_OPTIONS = USER_ROLES.map((role) => ({ value: role, label: role }));

const ADMIN_SCOPE_OPTIONS = [
  { value: 'ALL', label: 'ALL — All organization branches' },
  { value: 'ASSIGNED', label: 'ASSIGNED — Selected branches only' },
] as const;

const RESTRICTED_SCOPE_OPTIONS = [
  { value: 'ASSIGNED', label: 'ASSIGNED — Selected branches only' },
] as const;

function isUserRole(value: string): value is UserRole {
  return USER_ROLES.some((role) => role === value);
}

function isBranchScope(value: string): value is BranchScope {
  return BRANCH_SCOPES.some((scope) => scope === value);
}

export function UserFormFields({
  role,
  branchScope,
  branchIds,
  branches,
  branchesDirectory,
  disabled,
  lockRoleAndScope = false,
  roleError,
  branchScopeError,
  branchIdsError,
  onAccessChange,
}: UserFormFieldsProps) {
  const isAdmin = role === 'Admin';
  const scopeOptions = isAdmin ? ADMIN_SCOPE_OPTIONS : RESTRICTED_SCOPE_OPTIONS;
  const roleAndScopeDisabled = disabled || lockRoleAndScope;

  const handleToggleBranch = (branchId: string) => {
    const nextIds = branchIds.includes(branchId)
      ? branchIds.filter((id) => id !== branchId)
      : [...branchIds, branchId];
    onAccessChange({ branch_ids: nextIds });
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Role"
          options={ROLE_OPTIONS}
          value={role}
          disabled={roleAndScopeDisabled}
          error={roleError}
          onChange={(event) => {
            if (isUserRole(event.target.value)) {
              const forcedScope =
                event.target.value !== 'Admin' && branchScope === 'ALL'
                  ? 'ASSIGNED'
                  : undefined;
              onAccessChange({
                role: event.target.value,
                ...(forcedScope ? { branch_scope: forcedScope } : {}),
              });
            }
          }}
        />
        <Select
          label="Branch scope"
          options={scopeOptions}
          value={branchScope}
          disabled={roleAndScopeDisabled}
          hint={
            isAdmin
              ? undefined
              : 'Non-Admin accounts are restricted to ASSIGNED branch scope.'
          }
          error={branchScopeError}
          onChange={(event) => {
            if (isBranchScope(event.target.value)) {
              onAccessChange({ branch_scope: event.target.value });
            }
          }}
        />
      </div>

      {branchScope === 'ASSIGNED' ? (
        <BranchAccessSelector
          branches={branches}
          selectedBranchIds={branchIds}
          isLoading={branchesDirectory.isLoading}
          isError={branchesDirectory.isError}
          disabled={disabled}
          error={branchIdsError}
          onToggleBranch={handleToggleBranch}
        />
      ) : null}
    </>
  );
}
