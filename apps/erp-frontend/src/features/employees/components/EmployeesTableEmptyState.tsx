import { Users } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';

export interface EmployeesTableEmptyStateProps {
  hasActiveFilters: boolean;
  canWrite: boolean;
  onResetFilters: () => void;
  onAddEmployee: () => void;
}

export function EmployeesTableEmptyState({
  hasActiveFilters,
  canWrite,
  onResetFilters,
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

  return (
    <EmptyState
      icon={<Users className="h-5 w-5" />}
      title="No employees yet"
      description={
        canWrite
          ? 'Add your first employee to record their home branch, job role, and hire date.'
          : 'No employee records are available for this branch yet.'
      }
      action={
        canWrite ? (
          <Button variant="primary" onClick={onAddEmployee}>
            Add employee
          </Button>
        ) : undefined
      }
    />
  );
}
