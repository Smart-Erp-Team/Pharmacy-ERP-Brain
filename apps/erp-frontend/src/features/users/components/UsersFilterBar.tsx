import { Search } from 'lucide-react';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { Branch } from '../../../features/branches';
import type {
  UserRoleFilter,
  UserStatusFilter,
} from '../hooks/useUsersPageState';
import { USER_ROLES } from '../schemas/userSchema';

const ROLE_OPTIONS = [
  { value: 'all', label: 'All roles' },
  ...USER_ROLES.map((role) => ({ value: role, label: role })),
] as const;

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active accounts' },
  { value: 'all', label: 'All accounts (include inactive)' },
] as const;

export interface UsersFilterBarProps {
  searchTerm: string;
  branchFilter: string;
  roleFilter: UserRoleFilter;
  statusFilter: UserStatusFilter;
  branches: readonly Branch[];
  isBranchesError: boolean;
  isOrgAdmin: boolean;
  allowedBranchIds: readonly string[];
  onSearchChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onStatusChange: (value: string) => void;
}

export function UsersFilterBar({
  searchTerm,
  branchFilter,
  roleFilter,
  statusFilter,
  branches,
  isBranchesError,
  isOrgAdmin,
  allowedBranchIds,
  onSearchChange,
  onBranchChange,
  onRoleChange,
  onStatusChange,
}: UsersFilterBarProps) {
  const branchOptions = isOrgAdmin
    ? [
        { value: '', label: 'All branches' },
        ...branches.map((branch) => ({
          value: branch.branch_id,
          label: `${branch.branch_code} — ${branch.name}`,
        })),
      ]
    : allowedBranchIds.map((branchId) => {
        const matched = branches.find(
          (branch) => branch.branch_id === branchId
        );
        return {
          value: branchId,
          label: matched
            ? `${matched.branch_code} — ${matched.name}`
            : branchId,
        };
      });

  return (
    <div className="border-border flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-end">
      <div className="flex-1">
        <Input
          label="Search users"
          placeholder="Search by username, employee name, or employee no"
          leadingIcon={<Search className="h-4 w-4" />}
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      <div className="lg:w-60">
        <Select
          label="Branch filter"
          options={branchOptions}
          value={branchFilter}
          hint={isBranchesError ? 'Branch list unavailable' : undefined}
          onChange={(event) => onBranchChange(event.target.value)}
        />
      </div>
      <div className="lg:w-44">
        <Select
          label="Role filter"
          options={ROLE_OPTIONS}
          value={roleFilter}
          onChange={(event) => onRoleChange(event.target.value)}
        />
      </div>
      <div className="lg:w-60">
        <Select
          label="Status filter"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={(event) => onStatusChange(event.target.value)}
        />
      </div>
    </div>
  );
}
