import { Pencil } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { TableCell, TableRow } from '../../../components/ui/Table';
import { Toggle } from '../../../components/ui/Toggle';
import type { EmployeeDto } from '../../../types/api';

export interface EmployeeTableRowProps {
  employee: EmployeeDto;
  branchLabel: string;
  isToggling: boolean;
  onEdit: (employee: EmployeeDto) => void;
  onToggleActive: (employee: EmployeeDto, nextActive: boolean) => void;
}

export function EmployeeTableRow({
  employee,
  branchLabel,
  isToggling,
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
        {employee.job_title ? employee.job_title : '—'}
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
          <Toggle
            label={`Toggle status for ${employee.full_name}`}
            checked={employee.is_active}
            disabled={isToggling}
            onChange={(nextActive) => onToggleActive(employee, nextActive)}
          />
        </div>
      </TableCell>
      <TableCell>
        <Button
          variant="secondary"
          onClick={() => onEdit(employee)}
          leadingIcon={<Pencil className="h-3.5 w-3.5" />}
        >
          Edit
        </Button>
      </TableCell>
    </TableRow>
  );
}
