import { KeyRound, LogOut, Pencil } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { TableCell, TableRow } from '../../../components/ui/Table';
import { Toggle } from '../../../components/ui/Toggle';
import type { UserDto } from '../../../types/api';
import type { EmployeeDisplay } from '../hooks/useUsersPageState';

export interface UserTableRowProps {
  user: UserDto;
  employeeDisplay: EmployeeDisplay;
  referenceNowMs: number;
  isToggling: boolean;
  onEdit: (user: UserDto) => void;
  onResetPassword: (user: UserDto) => void;
  onRevokeSessions: (user: UserDto) => void;
  onToggleActive: (user: UserDto, nextActive: boolean) => void;
}

function isLockoutActive(
  lockoutEnd: UserDto['lockout_end'],
  referenceNowMs: number
): boolean {
  if (!lockoutEnd) {
    return false;
  }
  const lockoutMs = new Date(lockoutEnd).getTime();
  return Number.isFinite(lockoutMs) && lockoutMs > referenceNowMs;
}

export function UserTableRow({
  user,
  employeeDisplay,
  referenceNowMs,
  isToggling,
  onEdit,
  onResetPassword,
  onRevokeSessions,
  onToggleActive,
}: UserTableRowProps) {
  const isLocked = isLockoutActive(user.lockout_end, referenceNowMs);

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span
            className={
              employeeDisplay.isUnavailable
                ? 'text-text-muted italic'
                : 'text-text font-semibold'
            }
          >
            {employeeDisplay.primary}
          </span>
          {employeeDisplay.secondary ? (
            <span className="text-body-sm text-text-muted font-mono">
              {employeeDisplay.secondary}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-text font-mono font-semibold">
        {user.username}
      </TableCell>
      <TableCell>
        <Badge variant={user.role === 'Admin' ? 'info' : 'neutral'}>
          {user.role}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={user.branch_scope === 'ALL' ? 'info' : 'neutral'}>
          {user.branch_scope}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <Badge variant={user.is_active ? 'success' : 'neutral'} dot>
              {user.is_active ? 'Active' : 'Inactive'}
            </Badge>
            <Toggle
              label={`Toggle status for ${user.username}`}
              checked={user.is_active}
              disabled={isToggling}
              onChange={(nextActive) => onToggleActive(user, nextActive)}
            />
          </div>
          {isLocked ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning">Temporarily locked</Badge>
              <span className="text-body-sm text-warning font-medium">
                Failed login attempts
              </span>
            </div>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => onEdit(user)}
            leadingIcon={<Pencil className="h-3.5 w-3.5" />}
          >
            Edit
          </Button>
          <Button
            variant="secondary"
            onClick={() => onResetPassword(user)}
            leadingIcon={<KeyRound className="h-3.5 w-3.5" />}
          >
            Reset password
          </Button>
          <Button
            variant="secondary"
            onClick={() => onRevokeSessions(user)}
            leadingIcon={<LogOut className="h-3.5 w-3.5" />}
          >
            Revoke sessions
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
