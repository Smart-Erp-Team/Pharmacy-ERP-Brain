import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { useAllBranchesQuery, type Branch } from '../../../features/branches';
import { useAuth } from '../../../hooks/useAuth';
import { ApiClientError } from '../../../lib/api/client';
import {
  hasNextNumberedPage,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
} from '../../../lib/api/pagination';
import type { Employee } from '../../../types/api';
import type { EmployeeStatusFilter } from '../components/EmployeesFilterBar';
import { useEmployeesQuery, usePatchEmployeeMutation } from './useEmployees';

export function useEmployeesPageState() {
  const { runtime } = useAuth();
  const canWrite = runtime === 'Cloud';

  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<EmployeeStatusFilter>('active');
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [formModalState, setFormModalState] = useState<{
    open: boolean;
    employee: Employee | null;
  }>({ open: false, employee: null });
  const [togglingEmployeeId, setTogglingEmployeeId] = useState<string | null>(
    null
  );

  const branchesQuery = useAllBranchesQuery({
    include_inactive: true,
  });

  const employeesQuery = useEmployeesQuery({
    page,
    page_size: DEFAULT_PAGE_SIZE,
    branch_id: branchFilter || undefined,
    include_inactive: statusFilter === 'all',
    search: searchTerm.trim() || undefined,
  });

  const patchEmployeeMutation = usePatchEmployeeMutation();

  const branches: readonly Branch[] = useMemo(
    () => branchesQuery.data ?? [],
    [branchesQuery.data]
  );

  const branchLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const branch of branches) {
      map.set(branch.branch_id, `${branch.branch_code} — ${branch.name}`);
    }
    return map;
  }, [branches]);

  const getBranchLabel = (branchId: string): string => {
    if (branchesQuery.isError) {
      return 'Branch unavailable';
    }
    if (branchesQuery.isPending) {
      return 'Loading branch...';
    }
    return branchLabels.get(branchId) ?? 'Branch unavailable';
  };

  const employees = employeesQuery.data?.items ?? [];
  const totalCount = employeesQuery.data?.total_count ?? null;
  const pageSize = employeesQuery.data?.page_size ?? DEFAULT_PAGE_SIZE;
  const hasNextPage = hasNextNumberedPage(employeesQuery.data);

  const handleSearchChange = (nextSearch: string) => {
    setSearchTerm(nextSearch);
    setPage(DEFAULT_PAGE);
  };

  const handleBranchChange = (nextBranchId: string) => {
    setBranchFilter(nextBranchId);
    setPage(DEFAULT_PAGE);
  };

  const handleStatusChange = (nextValue: string) => {
    const nextFilter: EmployeeStatusFilter =
      nextValue === 'all' ? 'all' : 'active';
    setStatusFilter(nextFilter);
    setPage(DEFAULT_PAGE);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setBranchFilter('');
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

  const handleToggleActive = async (
    employee: Employee,
    nextActive: boolean
  ) => {
    if (!canWrite) {
      return;
    }
    setTogglingEmployeeId(employee.employee_id);
    try {
      await patchEmployeeMutation.mutateAsync({
        employeeId: employee.employee_id,
        payload: { is_active: nextActive },
      });
      toast.success(
        `${employee.full_name} marked ${nextActive ? 'active' : 'inactive'}`
      );
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : 'Unable to update employee status.'
      );
    } finally {
      setTogglingEmployeeId(null);
    }
  };

  return {
    canWrite,
    searchTerm,
    branchFilter,
    statusFilter,
    page,
    pageSize,
    totalCount,
    hasNextPage,
    branches,
    getBranchLabel,
    branchesQuery,
    employees,
    employeesQuery,
    formModalState,
    setFormModalState,
    togglingEmployeeId,
    handleSearchChange,
    handleBranchChange,
    handleStatusChange,
    resetFilters,
    handlePageChange,
    handleToggleActive,
  };
}
