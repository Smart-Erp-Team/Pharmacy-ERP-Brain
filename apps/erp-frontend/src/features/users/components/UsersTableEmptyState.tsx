import { Shield } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';

export interface UsersTableEmptyStateProps {
  hasActiveFilters: boolean;
  hasHiddenInactive: boolean;
  onResetFilters: () => void;
  onShowAllUsers?: () => void;
  onAddUser: () => void;
}

export function UsersTableEmptyState({
  hasActiveFilters,
  hasHiddenInactive,
  onResetFilters,
  onShowAllUsers,
  onAddUser,
}: UsersTableEmptyStateProps) {
  if (hasActiveFilters) {
    return (
      <EmptyState
        icon={<Shield className="h-5 w-5" />}
        title="No user accounts match your filters"
        description="Try clearing your search term, changing the role filter, or including inactive accounts."
        action={
          <Button variant="secondary" onClick={onResetFilters}>
            Clear filters
          </Button>
        }
      />
    );
  }

  if (hasHiddenInactive && onShowAllUsers) {
    return (
      <EmptyState
        icon={<Shield className="h-5 w-5" />}
        title="No active user accounts"
        description="All accounts on this page are inactive. Switch status filter to view inactive accounts."
        action={
          <Button variant="secondary" onClick={onShowAllUsers}>
            Show all accounts
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={<Shield className="h-5 w-5" />}
      title="No user accounts yet"
      description="Create a user account for an active employee to assign a role and branch access scope."
      action={
        <Button variant="primary" onClick={onAddUser}>
          Add user
        </Button>
      }
    />
  );
}
