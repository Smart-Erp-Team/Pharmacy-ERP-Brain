import { Search } from 'lucide-react';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
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
  { value: 'inactive', label: 'Inactive only' },
] as const;

export interface UsersFilterBarProps {
  searchTerm: string;
  roleFilter: UserRoleFilter;
  statusFilter: UserStatusFilter;
  onSearchChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onStatusChange: (value: string) => void;
}

export function UsersFilterBar({
  searchTerm,
  roleFilter,
  statusFilter,
  onSearchChange,
  onRoleChange,
  onStatusChange,
}: UsersFilterBarProps) {
  return (
    <div className="border-border flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Input
          label="Search users"
          placeholder="Search by username, employee name, or employee no"
          leadingIcon={<Search className="h-4 w-4" />}
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      <div className="sm:w-52">
        <Select
          label="Role filter"
          options={ROLE_OPTIONS}
          value={roleFilter}
          onChange={(event) => onRoleChange(event.target.value)}
        />
      </div>
      <div className="sm:w-64">
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
