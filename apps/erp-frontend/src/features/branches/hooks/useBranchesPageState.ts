import { useState } from 'react';
import { toast } from 'react-toastify';
import { ApiClientError } from '../../../lib/api/client';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '../../../lib/api/pagination';
import type { Branch, EnrollmentToken } from '../../../types/api';
import type { BranchStatusFilter } from '../components/BranchesFilterBar';
import {
  useBranchesQuery,
  useCreateEnrollmentTokenMutation,
  usePatchBranchMutation,
} from './useBranches';

export const BRANCHES_PAGE_SIZE = DEFAULT_PAGE_SIZE;

export function useBranchesPageState() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] =
    useState<BranchStatusFilter>('active');
  const [page, setPage] = useState(DEFAULT_PAGE);
  const [formModalState, setFormModalState] = useState<{
    open: boolean;
    branch: Branch | null;
  }>({ open: false, branch: null });
  const [tokenModalState, setTokenModalState] = useState<{
    open: boolean;
    branch: Branch | null;
    tokenData: EnrollmentToken | null;
    errorMessage: string | null;
  }>({ open: false, branch: null, tokenData: null, errorMessage: null });
  const [togglingBranchId, setTogglingBranchId] = useState<string | null>(null);

  const trimmedSearch = searchTerm.trim();
  const branchesQuery = useBranchesQuery({
    page,
    page_size: BRANCHES_PAGE_SIZE,
    include_inactive: statusFilter === 'all',
    ...(trimmedSearch.length > 0 ? { search: trimmedSearch } : {}),
  });
  const patchBranchMutation = usePatchBranchMutation();
  const enrollmentTokenMutation = useCreateEnrollmentTokenMutation();

  const handleSearchChange = (nextSearch: string) => {
    setSearchTerm(nextSearch);
    setPage(DEFAULT_PAGE);
  };

  const handleStatusChange = (nextValue: string) => {
    const nextFilter: BranchStatusFilter =
      nextValue === 'all' ? 'all' : 'active';
    setStatusFilter(nextFilter);
    setPage(DEFAULT_PAGE);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('active');
    setPage(DEFAULT_PAGE);
  };

  const handlePageChange = (nextPage: number) => {
    if (nextPage < DEFAULT_PAGE) {
      return;
    }
    setPage(nextPage);
  };

  const handleToggleActive = async (branch: Branch, nextActive: boolean) => {
    setTogglingBranchId(branch.branch_id);
    try {
      await patchBranchMutation.mutateAsync({
        branchId: branch.branch_id,
        payload: { is_active: nextActive },
      });
      toast.success(
        `${branch.name} marked ${nextActive ? 'active' : 'inactive'}`
      );
    } catch (error: unknown) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : 'Unable to update branch status.'
      );
    } finally {
      setTogglingBranchId(null);
    }
  };

  const requestEnrollmentToken = async (branch: Branch) => {
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
    } catch (error: unknown) {
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
    statusFilter,
    page,
    branches: branchesQuery.data?.items ?? [],
    branchesQuery,
    formModalState,
    setFormModalState,
    tokenModalState,
    setTokenModalState,
    togglingBranchId,
    isGeneratingToken: enrollmentTokenMutation.isPending,
    handleSearchChange,
    handleStatusChange,
    resetFilters,
    handlePageChange,
    handleToggleActive,
    requestEnrollmentToken,
  };
}
