import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { useAllBranchesQuery, type Branch } from '../../../features/branches';
import {
  useAllEmployeesQuery,
  type Employee,
} from '../../../features/employees';
import { useAuth } from '../../../hooks/useAuth';
import { ApiClientError } from '../../../lib/api/client';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '../../../lib/api/pagination';
import type { User, UserRole } from '../../../types/api';
import {
  normalizeBranchIds,
  USER_ROLES,
  type EditUserFormValues,
} from '../schemas/userSchema';
import {
  useAllUsersQuery,
  usePatchUserMutation,
  useUsersQuery,
} from './useUsers';

export function resolveEffectiveEditValues(
  values: Partial<EditUserFormValues>,
  user: User,
  isSelf: boolean
): EditUserFormValues {
  return {
    role: isSelf ? user.role : (values.role ?? user.role),
    branch_scope: isSelf
      ? user.branch_scope
      : (values.branch_scope ?? user.branch_scope),
    branch_ids: values.branch_ids ?? user.branch_ids,
    is_active: isSelf ? user.is_active : (values.is_active ?? user.is_active),
  };
}

export function hasEffectiveEditChanges(
  values: EditUserFormValues,
  user: User
): boolean {
  if (
    values.role !== user.role ||
    values.branch_scope !== user.branch_scope ||
    values.is_active !== user.is_active
  ) {
    return true;
  }
  const left =
    values.branch_scope === 'ALL'
      ? []
      : [...normalizeBranchIds(values.branch_ids)].sort();
  const right =
    user.branch_scope === 'ALL'
      ? []
      : [...normalizeBranchIds(user.branch_ids)].sort();
  return (
    left.length !== right.length || left.some((id, idx) => id !== right[idx])
  );
}

export type UserRoleFilter = 'all' | UserRole;
export type UserStatusFilter = 'active' | 'all';

export interface EmployeeDisplay {
  primary: string;
  secondary?: string;
  isUnavailable: boolean;
}

export interface BranchAccessDisplay {
  label: string;
  isMuted: boolean;
}

export interface DirectoryQueryStatus {
  isLoading: boolean;
  isError: boolean;
  isRetrying: boolean;
  onRetry: () => void;
}

function isUserRole(value: string): value is UserRole {
  return USER_ROLES.some((role) => role === value);
}

export function useUsersPageState() {
  const { currentUser } = useAuth();
  const currentUserId = currentUser?.user_id ?? null;

  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('active');
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [formModalState, setFormModalState] = useState<{
    open: boolean;
    user: User | null;
  }>({ open: false, user: null });
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [revokeSessionsUser, setRevokeSessionsUser] = useState<User | null>(
    null
  );
  const [togglingUserIds, setTogglingUserIds] = useState<string[]>([]);
  const [mountNowMs] = useState(() => Date.now());

  const usersQuery = useUsersQuery({
    page,
    page_size: DEFAULT_PAGE_SIZE,
    branch_id: branchFilter || undefined,
    role: roleFilter === 'all' ? undefined : roleFilter,
    include_inactive: statusFilter === 'all',
  });

  const isCreatingUser = formModalState.open && formModalState.user === null;
  const hasCompleteUnfilteredUsers =
    page === DEFAULT_PAGE &&
    statusFilter === 'all' &&
    roleFilter === 'all' &&
    branchFilter === '' &&
    usersQuery.isSuccess &&
    usersQuery.data.next_cursor === null &&
    usersQuery.data.items.length >= usersQuery.data.total_count;
  const needsFullUsersDirectory = isCreatingUser && !hasCompleteUnfilteredUsers;

  const allUsersQuery = useAllUsersQuery(
    { include_inactive: true },
    { enabled: needsFullUsersDirectory }
  );

  const employeesQuery = useAllEmployeesQuery({ include_inactive: true });
  const branchesQuery = useAllBranchesQuery({ include_inactive: true });
  const patchUserMutation = usePatchUserMutation();

  const users = useMemo(
    () => usersQuery.data?.items ?? [],
    [usersQuery.data?.items]
  );

  const employees: readonly Employee[] = useMemo(
    () => employeesQuery.data ?? [],
    [employeesQuery.data]
  );

  const branches: readonly Branch[] = useMemo(
    () => branchesQuery.data ?? [],
    [branchesQuery.data]
  );

  const employeesById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const employee of employees) {
      map.set(employee.employee_id.toLowerCase(), employee);
    }
    return map;
  }, [employees]);

  const branchesById = useMemo(() => {
    const map = new Map<string, Branch>();
    for (const branch of branches) {
      map.set(branch.branch_id.toLowerCase(), branch);
    }
    return map;
  }, [branches]);

  const eligibleEmployees = useMemo(() => {
    if (employeesQuery.isError) {
      return [];
    }
    const completeUsers = hasCompleteUnfilteredUsers
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
    hasCompleteUnfilteredUsers,
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

  const getBranchAccessDisplay = (user: User): BranchAccessDisplay => {
    if (user.branch_scope === 'ALL') {
      return { label: 'All branches', isMuted: false };
    }
    if (user.branch_ids.length === 0) {
      return { label: 'No branches assigned', isMuted: true };
    }
    if (branchesQuery.isPending) {
      return { label: 'Loading branches...', isMuted: true };
    }
    const resolvedCodes: string[] = [];
    for (const branchId of user.branch_ids) {
      const branch = branchesById.get(branchId.toLowerCase());
      if (branch) {
        resolvedCodes.push(branch.branch_code);
      }
    }
    if (resolvedCodes.length === user.branch_ids.length) {
      return { label: resolvedCodes.join(', '), isMuted: false };
    }
    const count = user.branch_ids.length;
    const countLabel = `${count} ${count === 1 ? 'branch' : 'branches'}`;
    if (resolvedCodes.length > 0) {
      return {
        label: `${resolvedCodes.join(', ')} (${countLabel})`,
        isMuted: false,
      };
    }
    return { label: countLabel, isMuted: true };
  };

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return users;
    }

    return users.filter((user) => {
      const employee = employeesById.get(user.employee_id.toLowerCase());
      return (
        user.username.toLowerCase().includes(normalizedSearch) ||
        (employee?.full_name.toLowerCase().includes(normalizedSearch) ??
          false) ||
        (employee?.employee_no.toLowerCase().includes(normalizedSearch) ??
          false)
      );
    });
  }, [employeesById, searchTerm, users]);

  const pageSize = usersQuery.data?.page_size ?? DEFAULT_PAGE_SIZE;
  const hasNextPage = usersQuery.data
    ? usersQuery.data.next_cursor !== null
    : false;
  const hasClientSearch = searchTerm.trim().length > 0;
  const totalCount = hasClientSearch
    ? page === DEFAULT_PAGE && !hasNextPage
      ? filteredUsers.length
      : null
    : (usersQuery.data?.total_count ?? null);

  const handleBranchChange = (nextBranchId: string) => {
    setBranchFilter(nextBranchId);
    setPage(DEFAULT_PAGE);
  };

  const handleRoleChange = (nextValue: string) => {
    const nextRole: UserRoleFilter = isUserRole(nextValue) ? nextValue : 'all';
    setRoleFilter(nextRole);
    setPage(DEFAULT_PAGE);
  };

  const handleStatusChange = (nextValue: string) => {
    const nextStatus: UserStatusFilter = nextValue === 'all' ? 'all' : 'active';
    setStatusFilter(nextStatus);
    setPage(DEFAULT_PAGE);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setBranchFilter('');
    setRoleFilter('all');
    setStatusFilter('active');
    setPage(DEFAULT_PAGE);
  };

  const handlePageChange = (nextPage: number) => {
    if (nextPage < DEFAULT_PAGE) {
      return;
    }
    if (nextPage > page && !hasNextPage) {
      return;
    }
    setPage(nextPage);
  };

  const handleToggleActive = async (user: User, nextActive: boolean) => {
    if (
      currentUserId === user.user_id ||
      togglingUserIds.includes(user.user_id)
    ) {
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
    currentUserId,
    searchTerm,
    setSearchTerm,
    branchFilter,
    roleFilter,
    statusFilter,
    page,
    pageSize,
    totalCount,
    hasNextPage,
    branches,
    eligibleEmployees,
    getEmployeeDisplay,
    getBranchAccessDisplay,
    usersQuery,
    employeesDirectory,
    branchesDirectory,
    filteredUsers,
    referenceNowMs,
    formModalState,
    setFormModalState,
    resetPasswordUser,
    setResetPasswordUser,
    revokeSessionsUser,
    setRevokeSessionsUser,
    togglingUserIds,
    handleBranchChange,
    handleRoleChange,
    handleStatusChange,
    resetFilters,
    handlePageChange,
    handleToggleActive,
  };
}
