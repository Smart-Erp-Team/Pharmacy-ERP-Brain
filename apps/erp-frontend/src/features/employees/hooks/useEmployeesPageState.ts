import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { useBranchesQuery } from '../../../features/branches';
import { ApiClientError } from '../../../lib/api/client';
import type { EmployeeDto } from '../../../types/api';
import type { EmployeeStatusFilter } from '../components/EmployeesFilterBar';
import { useEmployeesQuery, usePatchEmployeeMutation } from './useEmployees';

export const EMPLOYEES_PAGE_SIZE = 20;

export function useEmployeesPageState() {
  const [searchTerm, setSearchTerm] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<EmployeeStatusFilter>('active');
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);
  const [formModalState, setFormModalState] = useState<{
    open: boolean;
    employee: EmployeeDto | null;
  }>({ open: false, employee: null });
  const [togglingEmployeeId, setTogglingEmployeeId] = useState<string | null>(
    null
  );

  const branchesQuery = useBranchesQuery({
    includeInactive: true,
    limit: 200,
  });

  const employeesQuery = useEmployeesQuery({
    cursor: cursorStack[pageIndex],
    limit: EMPLOYEES_PAGE_SIZE,
    branchId: branchFilter || undefined,
  });

  const patchEmployeeMutation = usePatchEmployeeMutation();

  const branches = useMemo(
    () => branchesQuery.data?.items ?? [],
    [branchesQuery.data?.items]
  );

  const branchLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const branch of branches) {
      map.set(branch.branch_id, `${branch.code} — ${branch.name}`);
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

  const filteredEmployees = useMemo(() => {
    const items = employeesQuery.data?.items ?? [];
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return items.filter((employee) => {
      if (statusFilter === 'active' && !employee.is_active) {
        return false;
      }
      if (statusFilter === 'inactive' && employee.is_active) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      return (
        employee.employee_no.toLowerCase().includes(normalizedSearch) ||
        employee.full_name.toLowerCase().includes(normalizedSearch) ||
        (employee.job_title ?? '').toLowerCase().includes(normalizedSearch) ||
        (employee.email ?? '').toLowerCase().includes(normalizedSearch) ||
        (employee.phone ?? '').toLowerCase().includes(normalizedSearch)
      );
    });
  }, [employeesQuery.data?.items, searchTerm, statusFilter]);

  const handleBranchChange = (nextBranchId: string) => {
    setBranchFilter(nextBranchId);
    setCursorStack([undefined]);
    setPageIndex(0);
  };

  const handleStatusChange = (nextValue: string) => {
    const nextFilter: EmployeeStatusFilter =
      nextValue === 'all' || nextValue === 'inactive' ? nextValue : 'active';
    setStatusFilter(nextFilter);
    setCursorStack([undefined]);
    setPageIndex(0);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setBranchFilter('');
    setStatusFilter('active');
    setCursorStack([undefined]);
    setPageIndex(0);
  };

  const handlePageChange = (nextPage: number) => {
    const nextIndex = nextPage - 1;
    if (nextIndex < 0) {
      return;
    }
    if (nextIndex < cursorStack.length) {
      setPageIndex(nextIndex);
      return;
    }
    const nextCursor = employeesQuery.data?.nextCursor;
    if (nextCursor) {
      setCursorStack((prev) => [...prev, nextCursor]);
      setPageIndex(nextIndex);
    }
  };

  const handleToggleActive = async (
    employee: EmployeeDto,
    nextActive: boolean
  ) => {
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

  const hasHiddenInactive =
    searchTerm.trim().length === 0 &&
    branchFilter === '' &&
    statusFilter === 'active' &&
    (employeesQuery.data?.items.length ?? 0) > 0 &&
    filteredEmployees.length === 0;

  return {
    searchTerm,
    setSearchTerm,
    branchFilter,
    statusFilter,
    pageIndex,
    branches,
    getBranchLabel,
    branchesQuery,
    filteredEmployees,
    hasHiddenInactive,
    employeesQuery,
    formModalState,
    setFormModalState,
    togglingEmployeeId,
    handleBranchChange,
    handleStatusChange,
    resetFilters,
    handlePageChange,
    handleToggleActive,
  };
}
