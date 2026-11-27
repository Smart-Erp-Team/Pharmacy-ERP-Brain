import { Search } from 'lucide-react';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';

export type BranchStatusFilter = 'active' | 'all';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active branches' },
  { value: 'all', label: 'All branches (include inactive)' },
] as const;

export interface BranchesFilterBarProps {
  searchTerm: string;
  statusFilter: BranchStatusFilter;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
}

export function BranchesFilterBar({
  searchTerm,
  statusFilter,
  onSearchChange,
  onStatusChange,
}: BranchesFilterBarProps) {
  return (
    <div className="border-border flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Input
          label="Search branches"
          placeholder="Search by branch code or name"
          leadingIcon={<Search className="h-4 w-4" />}
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
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
