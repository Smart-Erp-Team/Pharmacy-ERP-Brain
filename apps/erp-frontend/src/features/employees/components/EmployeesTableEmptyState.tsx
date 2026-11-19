import { Users } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';

export interface EmployeesTableEmptyStateProps {
  hasActiveFilters: boolean;
  hasHiddenInactive: boolean;
  onResetFilters: () => void;
  onShowAllEmployees?: () => void;
  onAddEmployee: () => void;
}

export function EmployeesTableEmptyState({
  hasActiveFilters,
  hasHiddenInactive,
  onResetFilters,
  onShowAllEmployees,
  onAddEmployee,
}: EmployeesTableEmptyStateProps) {
  if (hasActiveFilters) {
    return (
      <EmptyState
        icon={<Users className="h-5 w-5" />}
        title="No employees match your filters"
        description="Try clearing your search term, changing the home branch, or including inactive employees."
        action={
          <Button variant="secondary" onClick={onResetFilters}>
            Clear filters
          </Button>
        }
      />
    );
  }

  if (hasHiddenInactive && onShowAllEmployees) {
    return (
      <EmptyState
        icon={<Users className="h-5 w-5" />}
        title="No active employees"
        description="All employees on this page are inactive. Switch status filter to view inactive employees."
        action={
          <Button variant="secondary" onClick={onShowAllEmployees}>
            Show all employees
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={<Users className="h-5 w-5" />}
      title="No employees yet"
      description="Add your first employee to record their home branch, job role, and hire date."
      action={
        <Button variant="primary" onClick={onAddEmployee}>
          Add employee
        </Button>
      }
    />
  );
}
