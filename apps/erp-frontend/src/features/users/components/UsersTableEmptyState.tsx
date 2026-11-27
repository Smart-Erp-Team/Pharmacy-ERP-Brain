import { Shield } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';

export interface UsersTableEmptyStateProps {
  hasActiveFilters: boolean;
  canWrite: boolean;
  onResetFilters: () => void;
  onAddUser: () => void;
}

export function UsersTableEmptyState({
  hasActiveFilters,
  canWrite,
  onResetFilters,
  onAddUser,
}: UsersTableEmptyStateProps) {
  if (hasActiveFilters) {
    return (
      <EmptyState
        icon={<Shield className="h-5 w-5" />}
        title="No user accounts match your filters"
        description="Try clearing your search term, changing the branch or role filter, or including inactive accounts."
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
      icon={<Shield className="h-5 w-5" />}
      title="No user accounts yet"
      description={
        canWrite
          ? 'Create a user account for an active employee to assign a role and branch access scope.'
          : 'No user accounts are available in this branch yet.'
      }
      action={
        canWrite ? (
          <Button variant="primary" onClick={onAddUser}>
            Add user
          </Button>
        ) : undefined
      }
    />
  );
}
