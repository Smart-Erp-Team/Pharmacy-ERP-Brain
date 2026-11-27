import { Pencil } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { TableCell, TableRow } from '../../../components/ui/Table';
import { Toggle } from '../../../components/ui/Toggle';
import type { Employee } from '../../../types/api';

export interface EmployeeTableRowProps {
  employee: Employee;
  branchLabel: string;
  isToggling: boolean;
  canWrite: boolean;
  onEdit: (employee: Employee) => void;
  onToggleActive: (employee: Employee, nextActive: boolean) => void;
}

export function EmployeeTableRow({
  employee,
  branchLabel,
  isToggling,
  canWrite,
  onEdit,
  onToggleActive,
}: EmployeeTableRowProps) {
  return (
    <TableRow>
      <TableCell className="text-text font-mono font-semibold">
        {employee.employee_no}
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-text font-semibold">{employee.full_name}</span>
          {employee.email ? (
            <span className="text-body-sm text-text-muted">
              {employee.email}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-text-secondary">
        {employee.job_title}
      </TableCell>
      <TableCell className="text-text-secondary">{branchLabel}</TableCell>
      <TableCell className="text-text-secondary">
        {employee.phone ? employee.phone : '—'}
      </TableCell>
      <TableCell className="text-text-secondary">{employee.hired_on}</TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <Badge variant={employee.is_active ? 'success' : 'neutral'} dot>
            {employee.is_active ? 'Active' : 'Inactive'}
          </Badge>
          {canWrite ? (
            <Toggle
              label={`Toggle status for ${employee.full_name}`}
              checked={employee.is_active}
              disabled={isToggling}
              onChange={(nextActive) => onToggleActive(employee, nextActive)}
            />
          ) : null}
        </div>
      </TableCell>
      {canWrite ? (
        <TableCell>
          <Button
            variant="secondary"
            onClick={() => onEdit(employee)}
            leadingIcon={<Pencil className="h-3.5 w-3.5" />}
          >
            Edit
          </Button>
        </TableCell>
      ) : null}
    </TableRow>
  );
}
