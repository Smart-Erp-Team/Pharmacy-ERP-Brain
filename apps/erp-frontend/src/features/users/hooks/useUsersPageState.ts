import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { useAllBranchesQuery } from '../../../features/branches';
import {
  useAllEmployeesQuery,
  type EmployeeDto,
} from '../../../features/employees';
import { ApiClientError } from '../../../lib/api/client';
import type { Role, UserDto } from '../../../types/api';
import { USER_ROLES } from '../schemas/userSchema';
import {
  useAllUsersQuery,
  usePatchUserMutation,
  useUsersQuery,
} from './useUsers';

export const USERS_PAGE_SIZE = 20;

export type UserRoleFilter = 'all' | Role;
export type UserStatusFilter = 'active' | 'all' | 'inactive';

export interface EmployeeDisplay {
  primary: string;
  secondary?: string;
  isUnavailable: boolean;
}

export interface DirectoryQueryStatus {
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
}

function isRole(value: string): value is Role {
  return USER_ROLES.some((role) => role === value);
}

export function useUsersPageState() {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('active');
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);
  const [formModalState, setFormModalState] = useState<{
    open: boolean;
    user: UserDto | null;
  }>({ open: false, user: null });
  const [resetPasswordUser, setResetPasswordUser] = useState<UserDto | null>(
    null
  );
  const [revokeSessionsUser, setRevokeSessionsUser] = useState<UserDto | null>(
    null
  );
  const [togglingUserIds, setTogglingUserIds] = useState<string[]>([]);
  const [mountNowMs] = useState(() => Date.now());

  const usersQuery = useUsersQuery({
    cursor: cursorStack[pageIndex],
    limit: USERS_PAGE_SIZE,
  });

  const isCreatingUser = formModalState.open && formModalState.user === null;
  const hasCompleteFirstPageUsers =
    pageIndex === 0 &&
    usersQuery.isSuccess &&
    usersQuery.data.nextCursor === null;
  const needsFullUsersDirectory = isCreatingUser && !hasCompleteFirstPageUsers;
  const allUsersQuery = useAllUsersQuery({ enabled: needsFullUsersDirectory });

  const employeesQuery = useAllEmployeesQuery();

  const branchesQuery = useAllBranchesQuery({
    includeInactive: false,
  });

  const patchUserMutation = usePatchUserMutation();

  const users = useMemo(
    () => usersQuery.data?.items ?? [],
    [usersQuery.data?.items]
  );

  const employees = useMemo(
    () => employeesQuery.data ?? [],
    [employeesQuery.data]
  );

  const branches = useMemo(
    () => branchesQuery.data ?? [],
    [branchesQuery.data]
  );

  const employeesById = useMemo(() => {
    const map = new Map<string, EmployeeDto>();
    for (const employee of employees) {
      map.set(employee.employee_id.toLowerCase(), employee);
    }
    return map;
  }, [employees]);

  const eligibleEmployees = useMemo(() => {
    if (employeesQuery.isError) {
      return [];
    }
    const completeUsers = hasCompleteFirstPageUsers
      ? usersQuery.data.items
      : allUsersQuery.isError
        ? null
        : (allUsersQuery.data ?? null);
    if (!completeUsers) {
      return [];
    }
    const assignedIds = new Set(
      completeUsers.map((user) => user.employee_id.toLowerCase())
    );
    return employees.filter(
      (employee) =>
        employee.is_active &&
        !assignedIds.has(employee.employee_id.toLowerCase())
    );
  }, [
    allUsersQuery.data,
    allUsersQuery.isError,
    employees,
    employeesQuery.isError,
    hasCompleteFirstPageUsers,
    usersQuery.data,
  ]);

  const getEmployeeDisplay = (employeeId: string): EmployeeDisplay => {
    if (employeesQuery.isError) {
      return { primary: 'Employee unavailable', isUnavailable: true };
    }
    if (employeesQuery.isPending) {
      return { primary: 'Loading employee...', isUnavailable: false };
    }
    const employee = employeesById.get(employeeId.toLowerCase());
    if (!employee) {
      return { primary: 'Employee unavailable', isUnavailable: true };
    }
    return {
      primary: employee.full_name,
      secondary: employee.employee_no,
      isUnavailable: false,
    };
  };

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      if (statusFilter === 'active' && !user.is_active) {
        return false;
      }
      if (statusFilter === 'inactive' && user.is_active) {
        return false;
      }
      if (roleFilter !== 'all' && user.role !== roleFilter) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      const employee = employeesById.get(user.employee_id.toLowerCase());
      return (
        user.username.toLowerCase().includes(normalizedSearch) ||
        (employee?.full_name.toLowerCase().includes(normalizedSearch) ??
          false) ||
        (employee?.employee_no.toLowerCase().includes(normalizedSearch) ??
          false)
      );
    });
  }, [employeesById, roleFilter, searchTerm, statusFilter, users]);

  const handleRoleChange = (nextValue: string) => {
    const nextRole: UserRoleFilter = isRole(nextValue) ? nextValue : 'all';
    setRoleFilter(nextRole);
    setCursorStack([undefined]);
    setPageIndex(0);
  };

  const handleStatusChange = (nextValue: string) => {
    const nextStatus: UserStatusFilter =
      nextValue === 'all' || nextValue === 'inactive' ? nextValue : 'active';
    setStatusFilter(nextStatus);
    setCursorStack([undefined]);
    setPageIndex(0);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setRoleFilter('all');
    setStatusFilter('active');
    setCursorStack([undefined]);
    setPageIndex(0);
  };

  const handlePageChange = (nextPage: number) => {
    const nextIndex = nextPage - 1;
    if (nextIndex < 0) {
      return;
    }
    if (nextIndex < pageIndex && nextIndex < cursorStack.length) {
      setPageIndex(nextIndex);
      return;
    }
    if (nextIndex === pageIndex + 1) {
      const nextCursor = usersQuery.data?.nextCursor;
      if (nextCursor) {
        setCursorStack((prev) => [...prev.slice(0, nextIndex), nextCursor]);
        setPageIndex(nextIndex);
      }
    }
  };

  const handleToggleActive = async (user: UserDto, nextActive: boolean) => {
    if (togglingUserIds.includes(user.user_id)) {
      return;
    }
    setTogglingUserIds((prev) => [...prev, user.user_id]);
    try {
      await patchUserMutation.mutateAsync({
        userId: user.user_id,
        payload: { is_active: nextActive },
      });
      toast.success(
        `${user.username} marked ${nextActive ? 'active' : 'inactive'}`
      );
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.trace_id
            ? `${error.message} (Trace: ${error.trace_id})`
            : error.message
          : 'Unable to update user status.';
      toast.error(message);
    } finally {
      setTogglingUserIds((prev) => prev.filter((id) => id !== user.user_id));
    }
  };

  const hasHiddenInactive =
    searchTerm.trim().length === 0 &&
    roleFilter === 'all' &&
    statusFilter === 'active' &&
    users.length > 0 &&
    filteredUsers.length === 0;

  const referenceNowMs = Math.max(mountNowMs, usersQuery.dataUpdatedAt);

  const isEmployeesLoading =
    employeesQuery.isPending ||
    (employeesQuery.isError && employeesQuery.isFetching);
  const isAllUsersLoading =
    needsFullUsersDirectory &&
    (allUsersQuery.isPending ||
      (allUsersQuery.isError && allUsersQuery.isFetching));
  const isAllUsersError = needsFullUsersDirectory && allUsersQuery.isError;

  const employeesDirectory: DirectoryQueryStatus = {
    isLoading: isEmployeesLoading || isAllUsersLoading,
    isError: employeesQuery.isError || isAllUsersError,
    isRetrying:
      employeesQuery.isFetching ||
      (needsFullUsersDirectory && allUsersQuery.isFetching),
    onRetry: () => {
      if (employeesQuery.isError) {
        void employeesQuery.refetch();
      }
      if (isAllUsersError) {
        void allUsersQuery.refetch();
      }
    },
  };

  const branchesDirectory: DirectoryQueryStatus = {
    isLoading:
      branchesQuery.isPending ||
      (branchesQuery.isError && branchesQuery.isFetching),
    isError: branchesQuery.isError,
    isRetrying: branchesQuery.isFetching,
    onRetry: () => {
      void branchesQuery.refetch();
    },
  };

  return {
    searchTerm,
    setSearchTerm,
    roleFilter,
    statusFilter,
    pageIndex,
    branches,
    eligibleEmployees,
    getEmployeeDisplay,
    usersQuery,
    employeesDirectory,
    branchesDirectory,
    filteredUsers,
    hasHiddenInactive,
    referenceNowMs,
    formModalState,
    setFormModalState,
    resetPasswordUser,
    setResetPasswordUser,
    revokeSessionsUser,
    setRevokeSessionsUser,
    togglingUserIds,
    handleRoleChange,
    handleStatusChange,
    resetFilters,
    handlePageChange,
    handleToggleActive,
  };
}
