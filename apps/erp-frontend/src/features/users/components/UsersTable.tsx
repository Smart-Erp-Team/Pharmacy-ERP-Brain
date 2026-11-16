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
import type { UserDto } from '../../../types/api';
import type { EmployeeDisplay } from '../hooks/useUsersPageState';
import { UserTableRow } from './UserTableRow';
import { UsersTableEmptyState } from './UsersTableEmptyState';

export interface UsersTableProps {
  users: readonly UserDto[];
  getEmployeeDisplay: (employeeId: string) => EmployeeDisplay;
  referenceNowMs: number;
  isLoading: boolean;
  errorMessage: string | null;
  togglingUserIds: readonly string[];
  hasActiveFilters: boolean;
  hasHiddenInactive?: boolean;
  onRetry: () => void;
  onResetFilters: () => void;
  onShowAllUsers?: () => void;
  onAddUser: () => void;
  onEdit: (user: UserDto) => void;
  onResetPassword: (user: UserDto) => void;
  onRevokeSessions: (user: UserDto) => void;
  onToggleActive: (user: UserDto, nextActive: boolean) => void;
}

const COLUMNS = [
  { label: 'Employee', skeleton: 'h-4 w-36' },
  { label: 'Username', skeleton: 'h-4 w-28' },
  { label: 'Role', skeleton: 'h-5 w-20' },
  { label: 'Branch Scope', skeleton: 'h-5 w-20' },
  { label: 'Account Status', skeleton: 'h-5 w-32' },
  { label: 'Actions', skeleton: 'h-8 w-56' },
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

export function UsersTable({
  users,
  getEmployeeDisplay,
  referenceNowMs,
  isLoading,
  errorMessage,
  togglingUserIds,
  hasActiveFilters,
  hasHiddenInactive = false,
  onRetry,
  onResetFilters,
  onShowAllUsers,
  onAddUser,
  onEdit,
  onResetPassword,
  onRevokeSessions,
  onToggleActive,
}: UsersTableProps) {
  if (errorMessage) {
    return (
      <div className="p-6">
        <Alert variant="danger" title="Could not load user accounts">
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
      <div role="status" aria-busy="true" aria-label="Loading user accounts">
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

  if (users.length === 0) {
    return (
      <UsersTableEmptyState
        hasActiveFilters={hasActiveFilters}
        hasHiddenInactive={hasHiddenInactive}
        onResetFilters={onResetFilters}
        onShowAllUsers={onShowAllUsers}
        onAddUser={onAddUser}
      />
    );
  }

  return (
    <Table>
      {HEADERS}
      <TableBody>
        {users.map((user) => (
          <UserTableRow
            key={user.user_id}
            user={user}
            employeeDisplay={getEmployeeDisplay(user.employee_id)}
            referenceNowMs={referenceNowMs}
            isToggling={togglingUserIds.includes(user.user_id)}
            onEdit={onEdit}
            onResetPassword={onResetPassword}
            onRevokeSessions={onRevokeSessions}
            onToggleActive={onToggleActive}
          />
        ))}
      </TableBody>
    </Table>
  );
}
