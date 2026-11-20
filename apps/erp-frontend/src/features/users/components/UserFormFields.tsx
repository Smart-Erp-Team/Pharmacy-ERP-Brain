import { Alert } from '../../../components/ui/Alert';
import { Select } from '../../../components/ui/Select';
import type { BranchDto, BranchScope, Role } from '../../../types/api';
import type { DirectoryQueryStatus } from '../hooks/useUsersPageState';
import { BRANCH_SCOPES, USER_ROLES } from '../schemas/userSchema';
import { BranchAccessSelector } from './BranchAccessSelector';

export interface UserAccessPatch {
  role?: Role;
  branch_scope?: BranchScope;
  branch_ids?: string[];
}

export interface UserFormFieldsProps {
  role: Role;
  branchScope: BranchScope;
  branchIds: readonly string[];
  branches: readonly BranchDto[];
  branchesDirectory: DirectoryQueryStatus;
  disabled: boolean;
  roleError?: string;
  branchScopeError?: string;
  branchIdsError?: string;
  showPreservedGrantsNotice?: boolean;
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

function isRole(value: string): value is Role {
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
  roleError,
  branchScopeError,
  branchIdsError,
  showPreservedGrantsNotice = false,
  onAccessChange,
}: UserFormFieldsProps) {
  const isAdmin = role === 'Admin';
  const scopeOptions = isAdmin ? ADMIN_SCOPE_OPTIONS : RESTRICTED_SCOPE_OPTIONS;

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
          disabled={disabled}
          error={roleError}
          onChange={(event) => {
            if (isRole(event.target.value)) {
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
          disabled={disabled}
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
        <div className="flex flex-col gap-3">
          {showPreservedGrantsNotice ? (
            <Alert variant="info">
              Current branch grants are unavailable from GET /users. Existing
              assignments are preserved unless you select new branches below.
            </Alert>
          ) : null}
          <BranchAccessSelector
            branches={branches}
            selectedBranchIds={branchIds}
            isLoading={branchesDirectory.isLoading}
            isError={branchesDirectory.isError}
            disabled={disabled}
            error={branchIdsError}
            onToggleBranch={handleToggleBranch}
          />
        </div>
      ) : null}
    </>
  );
}
