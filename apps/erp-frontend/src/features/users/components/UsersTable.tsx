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
import type { User } from '../../../types/api';
import type {
  BranchAccessDisplay,
  EmployeeDisplay,
} from '../hooks/useUsersPageState';
import { UserTableRow } from './UserTableRow';
import { UsersTableEmptyState } from './UsersTableEmptyState';

export interface UsersTableProps {
  users: readonly User[];
  currentUserId: string | null;
  canWrite: boolean;
  canManageUser: (user: User) => boolean;
  getEmployeeDisplay: (employeeId: string) => EmployeeDisplay;
  getBranchAccessDisplay: (user: User) => BranchAccessDisplay;
  referenceNowMs: number;
  isLoading: boolean;
  errorMessage: string | null;
  togglingUserIds: readonly string[];
  hasActiveFilters: boolean;
  onRetry: () => void;
  onResetFilters: () => void;
  onAddUser: () => void;
  onEdit: (user: User) => void;
  onResetPassword: (user: User) => void;
  onRevokeSessions: (user: User) => void;
  onToggleActive: (user: User, nextActive: boolean) => void;
}

const COLUMNS = [
  { label: 'Employee', skeleton: 'h-4 w-36' },
  { label: 'Username', skeleton: 'h-4 w-28' },
  { label: 'Role', skeleton: 'h-5 w-20' },
  { label: 'Branch Scope', skeleton: 'h-5 w-24' },
  { label: 'Account Status', skeleton: 'h-5 w-32' },
  { label: 'Actions', skeleton: 'h-8 w-56' },
] as const;

export function UsersTable({
  users,
  currentUserId,
  canWrite,
  canManageUser,
  getEmployeeDisplay,
  getBranchAccessDisplay,
  referenceNowMs,
  isLoading,
  errorMessage,
  togglingUserIds,
  hasActiveFilters,
  onRetry,
  onResetFilters,
  onAddUser,
  onEdit,
  onResetPassword,
  onRevokeSessions,
  onToggleActive,
}: UsersTableProps) {
  const visibleColumns = canWrite
    ? COLUMNS
    : COLUMNS.filter((col) => col.label !== 'Actions');

  const headers = (
    <TableHeader>
      <TableRow>
        {visibleColumns.map((col) => (
          <TableHead key={col.label}>{col.label}</TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );

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
          {headers}
          <TableBody>
            {[0, 1, 2, 3].map((row) => (
              <TableRow key={row}>
                {visibleColumns.map((col) => (
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
        canWrite={canWrite}
        onResetFilters={onResetFilters}
        onAddUser={onAddUser}
      />
    );
  }

  return (
    <Table>
      {headers}
      <TableBody>
        {users.map((user) => (
          <UserTableRow
            key={user.user_id}
            user={user}
            employeeDisplay={getEmployeeDisplay(user.employee_id)}
            branchAccessDisplay={getBranchAccessDisplay(user)}
            referenceNowMs={referenceNowMs}
            isSelf={currentUserId === user.user_id}
            canWrite={canWrite}
            canManage={canManageUser(user)}
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
