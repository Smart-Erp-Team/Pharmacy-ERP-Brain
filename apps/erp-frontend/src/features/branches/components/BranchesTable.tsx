import { Building2 } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/Table';
import type { BranchDto } from '../../../types/api';
import { BranchTableRow } from './BranchTableRow';

export interface BranchesTableProps {
  branches: readonly BranchDto[];
  isLoading: boolean;
  errorMessage: string | null;
  togglingBranchId: string | null;
  hasActiveFilters: boolean;
  onRetry: () => void;
  onResetFilters: () => void;
  onAddBranch: () => void;
  onEdit: (branch: BranchDto) => void;
  onToggleActive: (branch: BranchDto, nextActive: boolean) => void;
  onGenerateToken: (branch: BranchDto) => void;
}

const HEADERS = (
  <TableHeader>
    <TableRow>
      <TableHead>Code</TableHead>
      <TableHead>Branch</TableHead>
      <TableHead>Location</TableHead>
      <TableHead>Status</TableHead>
      <TableHead>Actions</TableHead>
    </TableRow>
  </TableHeader>
);

export function BranchesTable({
  branches,
  isLoading,
  errorMessage,
  togglingBranchId,
  hasActiveFilters,
  onRetry,
  onResetFilters,
  onAddBranch,
  onEdit,
  onToggleActive,
  onGenerateToken,
}: BranchesTableProps) {
  if (errorMessage) {
    return (
      <div className="p-6">
        <Alert variant="danger" title="Could not load branches">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{errorMessage}</span>
            <Button variant="secondary" onClick={onRetry}>
              Retry
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <Table aria-busy="true" aria-label="Loading branches">
        {HEADERS}
        <TableBody>
          {[0, 1, 2, 3].map((row) => (
            <TableRow key={row}>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-44" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-8 w-40" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (branches.length === 0) {
    return (
      <EmptyState
        icon={<Building2 className="h-5 w-5" />}
        title={
          hasActiveFilters
            ? 'No branches match your filters'
            : 'No branches yet'
        }
        description={
          hasActiveFilters
            ? 'Try clearing your search term or including inactive branches.'
            : 'Create your first pharmacy branch to initialize its stock locations and enroll local terminals.'
        }
        action={
          hasActiveFilters ? (
            <Button variant="secondary" onClick={onResetFilters}>
              Clear filters
            </Button>
          ) : (
            <Button variant="primary" onClick={onAddBranch}>
              Add branch
            </Button>
          )
        }
      />
    );
  }

  return (
    <Table>
      {HEADERS}
      <TableBody>
        {branches.map((branch) => (
          <BranchTableRow
            key={branch.branch_id}
            branch={branch}
            isToggling={togglingBranchId === branch.branch_id}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
            onGenerateToken={onGenerateToken}
          />
        ))}
      </TableBody>
    </Table>
  );
}
