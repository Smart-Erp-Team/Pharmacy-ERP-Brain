import { Search } from 'lucide-react';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { BranchDto } from '../../../types/api';

export type EmployeeStatusFilter = 'active' | 'all' | 'inactive';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active employees' },
  { value: 'all', label: 'All employees (include inactive)' },
  { value: 'inactive', label: 'Inactive only' },
] as const;

export interface EmployeesFilterBarProps {
  searchTerm: string;
  branchId: string;
  statusFilter: EmployeeStatusFilter;
  branches: readonly BranchDto[];
  isBranchesError: boolean;
  onSearchChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
}

export function EmployeesFilterBar({
  searchTerm,
  branchId,
  statusFilter,
  branches,
  isBranchesError,
  onSearchChange,
  onBranchChange,
  onStatusChange,
}: EmployeesFilterBarProps) {
  const branchOptions = [
    { value: '', label: 'All branches' },
    ...branches.map((branch) => ({
      value: branch.branch_id,
      label: `${branch.code} — ${branch.name}`,
    })),
  ];

  return (
    <div className="border-border flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Input
          label="Search employees"
          placeholder="Search by employee no, name, job title, email, or phone"
          leadingIcon={<Search className="h-4 w-4" />}
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      <div className="sm:w-64">
        <Select
          label="Home branch"
          options={branchOptions}
          value={branchId}
          hint={isBranchesError ? 'Branch list unavailable' : undefined}
          onChange={(event) => onBranchChange(event.target.value)}
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
