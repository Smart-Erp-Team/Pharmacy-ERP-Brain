import { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { ApiClientError } from '../../../lib/api/client';
import type { BranchDto, EnrollmentTokenDto } from '../../../types/api';
import type { BranchStatusFilter } from '../components/BranchesFilterBar';
import {
  useBranchesQuery,
  useCreateEnrollmentTokenMutation,
  usePatchBranchMutation,
} from './useBranches';

export const BRANCHES_PAGE_SIZE = 20;

export function useBranchesPageState() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<BranchStatusFilter>('active');
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);
  const [formModalState, setFormModalState] = useState<{
    open: boolean;
    branch: BranchDto | null;
  }>({ open: false, branch: null });
  const [tokenModalState, setTokenModalState] = useState<{
    open: boolean;
    branch: BranchDto | null;
    tokenData: EnrollmentTokenDto | null;
    errorMessage: string | null;
  }>({ open: false, branch: null, tokenData: null, errorMessage: null });
  const [togglingBranchId, setTogglingBranchId] = useState<string | null>(null);

  const branchesQuery = useBranchesQuery({
    cursor: cursorStack[pageIndex],
    limit: BRANCHES_PAGE_SIZE,
    includeInactive: statusFilter !== 'active',
  });
  const patchBranchMutation = usePatchBranchMutation();
  const enrollmentTokenMutation = useCreateEnrollmentTokenMutation();

  const filteredBranches = useMemo(() => {
    const items = branchesQuery.data?.items ?? [];
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return items.filter((branch) => {
      if (statusFilter === 'inactive' && branch.is_active) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      const city = branch.address?.city ?? '';
      return (
        branch.code.toLowerCase().includes(normalizedSearch) ||
        branch.name.toLowerCase().includes(normalizedSearch) ||
        city.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [branchesQuery.data?.items, searchTerm, statusFilter]);

  const handleStatusChange = (nextValue: string) => {
    const nextFilter: BranchStatusFilter =
      nextValue === 'all' || nextValue === 'inactive' ? nextValue : 'active';
    setStatusFilter(nextFilter);
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
    const nextCursor = branchesQuery.data?.nextCursor;
    if (nextCursor) {
      setCursorStack((prev) => [...prev, nextCursor]);
      setPageIndex(nextIndex);
    }
  };

  const handleToggleActive = async (branch: BranchDto, nextActive: boolean) => {
    setTogglingBranchId(branch.branch_id);
    try {
      await patchBranchMutation.mutateAsync({
        branchId: branch.branch_id,
        payload: { is_active: nextActive },
      });
      toast.success(
        `${branch.name} marked ${nextActive ? 'active' : 'inactive'}`
      );
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : 'Unable to update branch status.'
      );
    } finally {
      setTogglingBranchId(null);
    }
  };

  const requestEnrollmentToken = async (branch: BranchDto) => {
    setTokenModalState({
      open: true,
      branch,
      tokenData: null,
      errorMessage: null,
    });
    try {
      const tokenData = await enrollmentTokenMutation.mutateAsync({
        branchId: branch.branch_id,
      });
      setTokenModalState({
        open: true,
        branch,
        tokenData,
        errorMessage: null,
      });
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.message
          : 'Unable to generate enrollment token.';
      setTokenModalState({
        open: true,
        branch,
        tokenData: null,
        errorMessage: message,
      });
      toast.error(message);
    }
  };

  return {
    searchTerm,
    setSearchTerm,
    statusFilter,
    pageIndex,
    filteredBranches,
    branchesQuery,
    formModalState,
    setFormModalState,
    tokenModalState,
    setTokenModalState,
    togglingBranchId,
    isGeneratingToken: enrollmentTokenMutation.isPending,
    handleStatusChange,
    handlePageChange,
    handleToggleActive,
    requestEnrollmentToken,
  };
}
