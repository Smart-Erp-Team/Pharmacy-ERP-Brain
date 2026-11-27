import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/Table';
import type { Branch } from '../../../types/api';
import { BranchesTableEmptyState } from './BranchesTableEmptyState';
import { BranchTableRow } from './BranchTableRow';

export interface BranchesTableProps {
  branches: readonly Branch[];
  isLoading: boolean;
  errorMessage: string | null;
  togglingBranchId: string | null;
  hasActiveFilters: boolean;
  canCreateBranch: boolean;
  canToggleBranchStatus: boolean;
  canEditBranch: (branchId: string) => boolean;
  canIssueEnrollmentToken: (branchId: string) => boolean;
  showActionsWhileLoading: boolean;
  onRetry: () => void;
  onResetFilters: () => void;
  onAddBranch: () => void;
  onEdit: (branch: Branch) => void;
  onToggleActive: (branch: Branch, nextActive: boolean) => void;
  onGenerateToken: (branch: Branch) => void;
}

const BRANCH_COLUMNS = [
  { label: 'Code', skeleton: 'h-4 w-20' },
  { label: 'Branch', skeleton: 'h-4 w-44' },
  { label: 'Location', skeleton: 'h-4 w-28' },
  { label: 'Status', skeleton: 'h-5 w-24' },
  { label: 'Actions', skeleton: 'h-8 w-40' },
] as const;

function renderHeaders(columns: readonly { label: string }[]) {
  return (
    <TableHeader>
      <TableRow>
        {columns.map((col) => (
          <TableHead key={col.label}>{col.label}</TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}

export function BranchesTable({
  branches,
  isLoading,
  errorMessage,
  togglingBranchId,
  hasActiveFilters,
  canCreateBranch,
  canToggleBranchStatus,
  canEditBranch,
  canIssueEnrollmentToken,
  showActionsWhileLoading,
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
    const skeletonColumns = showActionsWhileLoading
      ? BRANCH_COLUMNS
      : BRANCH_COLUMNS.filter((col) => col.label !== 'Actions');
    return (
      <Table aria-busy="true" aria-label="Loading branches">
        {renderHeaders(skeletonColumns)}
        <TableBody>
          {[0, 1, 2, 3].map((row) => (
            <TableRow key={row}>
              {skeletonColumns.map((col) => (
                <TableCell key={col.label}>
                  <Skeleton className={col.skeleton} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (branches.length === 0) {
    return (
      <BranchesTableEmptyState
        hasActiveFilters={hasActiveFilters}
        canCreateBranch={canCreateBranch}
        onResetFilters={onResetFilters}
        onAddBranch={onAddBranch}
      />
    );
  }

  const showActionsColumn = branches.some(
    (branch) =>
      canEditBranch(branch.branch_id) ||
      canIssueEnrollmentToken(branch.branch_id)
  );
  const visibleColumns = showActionsColumn
    ? BRANCH_COLUMNS
    : BRANCH_COLUMNS.filter((col) => col.label !== 'Actions');

  return (
    <Table>
      {renderHeaders(visibleColumns)}
      <TableBody>
        {branches.map((branch) => (
          <BranchTableRow
            key={branch.branch_id}
            branch={branch}
            isToggling={togglingBranchId === branch.branch_id}
            canToggleStatus={canToggleBranchStatus}
            canEdit={canEditBranch(branch.branch_id)}
            canIssueToken={canIssueEnrollmentToken(branch.branch_id)}
            showActionsColumn={showActionsColumn}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
            onGenerateToken={onGenerateToken}
          />
        ))}
      </TableBody>
    </Table>
  );
}
