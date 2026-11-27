import { Building2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';

export interface BranchesTableEmptyStateProps {
  hasActiveFilters: boolean;
  canCreateBranch: boolean;
  onResetFilters: () => void;
  onAddBranch: () => void;
}

export function BranchesTableEmptyState({
  hasActiveFilters,
  canCreateBranch,
  onResetFilters,
  onAddBranch,
}: BranchesTableEmptyStateProps) {
  if (hasActiveFilters) {
    return (
      <EmptyState
        icon={<Building2 className="h-5 w-5" />}
        title="No branches match your filters"
        description="Try clearing your search term or including inactive branches."
        action={
          <Button variant="secondary" onClick={onResetFilters}>
            Clear filters
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={<Building2 className="h-5 w-5" />}
      title="No branches yet"
      description={
        canCreateBranch
          ? 'Create your first pharmacy branch to initialize its stock locations and enroll local terminals.'
          : 'No branches are currently assigned to your account.'
      }
      action={
        canCreateBranch ? (
          <Button variant="primary" onClick={onAddBranch}>
            Add branch
          </Button>
        ) : undefined
      }
    />
  );
}
