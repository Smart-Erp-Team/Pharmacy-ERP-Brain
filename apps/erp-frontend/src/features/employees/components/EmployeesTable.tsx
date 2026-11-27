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
import type { Employee } from '../../../types/api';
import { EmployeeTableRow } from './EmployeeTableRow';
import { EmployeesTableEmptyState } from './EmployeesTableEmptyState';

export interface EmployeesTableProps {
  employees: readonly Employee[];
  getBranchLabel: (branchId: string) => string;
  isLoading: boolean;
  errorMessage: string | null;
  togglingEmployeeId: string | null;
  hasActiveFilters: boolean;
  onRetry: () => void;
  onResetFilters: () => void;
  onAddEmployee: () => void;
  onEdit: (employee: Employee) => void;
  onToggleActive: (employee: Employee, nextActive: boolean) => void;
}

const COLUMNS = [
  { label: 'Employee No', skeleton: 'h-4 w-20' },
  { label: 'Full Name', skeleton: 'h-4 w-36' },
  { label: 'Job Title', skeleton: 'h-4 w-28' },
  { label: 'Home Branch', skeleton: 'h-4 w-40' },
  { label: 'Phone', skeleton: 'h-4 w-24' },
  { label: 'Hire Date', skeleton: 'h-4 w-24' },
  { label: 'Status', skeleton: 'h-5 w-24' },
  { label: 'Actions', skeleton: 'h-8 w-20' },
] as const;

const HEADERS = (
  <TableHeader>
    <TableRow>
      {COLUMNS.map((col) => (
        <TableHead key={col.label}>{col.label}</TableHead>
      ))}
    </TableRow>
  </TableHeader>
);

export function EmployeesTable({
  employees,
  getBranchLabel,
  isLoading,
  errorMessage,
  togglingEmployeeId,
  hasActiveFilters,
  onRetry,
  onResetFilters,
  onAddEmployee,
  onEdit,
  onToggleActive,
}: EmployeesTableProps) {
  if (errorMessage) {
    return (
      <div className="p-6">
        <Alert variant="danger" title="Could not load employees">
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
      <div role="status" aria-busy="true" aria-label="Loading employees">
        <Table>
          {HEADERS}
          <TableBody>
            {[0, 1, 2, 3].map((row) => (
              <TableRow key={row}>
                {COLUMNS.map((col) => (
                  <TableCell key={col.label}>
                    <Skeleton className={col.skeleton} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (employees.length === 0) {
    return (
      <EmployeesTableEmptyState
        hasActiveFilters={hasActiveFilters}
        onResetFilters={onResetFilters}
        onAddEmployee={onAddEmployee}
      />
    );
  }

  return (
    <Table>
      {HEADERS}
      <TableBody>
        {employees.map((employee) => (
          <EmployeeTableRow
            key={employee.employee_id}
            employee={employee}
            branchLabel={getBranchLabel(employee.branch_id)}
            isToggling={togglingEmployeeId === employee.employee_id}
            onEdit={onEdit}
            onToggleActive={onToggleActive}
          />
        ))}
      </TableBody>
    </Table>
  );
}
