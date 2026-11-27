import { Plus } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { PageHeading } from '../../../components/ui/PageHeading';
import { Pagination } from '../../../components/ui/Pagination';
import { ApiClientError } from '../../../lib/api/client';
import { BranchFormModal } from '../components/BranchFormModal';
import { BranchesFilterBar } from '../components/BranchesFilterBar';
import { BranchesTable } from '../components/BranchesTable';
import { EnrollmentTokenModal } from '../components/EnrollmentTokenModal';
import {
  BRANCHES_PAGE_SIZE,
  useBranchesPageState,
} from '../hooks/useBranchesPageState';

export function BranchesPage() {
  const {
    searchTerm,
    statusFilter,
    page,
    branches,
    branchesQuery,
    formModalState,
    setFormModalState,
    tokenModalState,
    setTokenModalState,
    togglingBranchId,
    isGeneratingToken,
    handleSearchChange,
    handleStatusChange,
    resetFilters,
    handlePageChange,
    handleToggleActive,
    requestEnrollmentToken,
  } = useBranchesPageState();

  const queryErrorMessage = branchesQuery.isError
    ? branchesQuery.error instanceof ApiClientError
      ? branchesQuery.error.message
      : 'Unable to load branches.'
    : null;

  const pageData = branchesQuery.data;
  const hasNextPage = (pageData?.next_cursor ?? null) !== null;
  const showPagination =
    !branchesQuery.isLoading &&
    !branchesQuery.isError &&
    pageData !== undefined &&
    (branches.length > 0 || page > 1 || hasNextPage);

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Branches"
        description="Manage pharmacy branches, status, and single-use local terminal enrollment tokens."
        actions={
          <Button
            variant="primary"
            leadingIcon={<Plus className="h-4 w-4" />}
            onClick={() => setFormModalState({ open: true, branch: null })}
          >
            Add branch
          </Button>
        }
      />

      <Card>
        <BranchesFilterBar
          searchTerm={searchTerm}
          statusFilter={statusFilter}
          onSearchChange={handleSearchChange}
          onStatusChange={handleStatusChange}
        />

        <BranchesTable
          branches={branches}
          isLoading={branchesQuery.isLoading}
          errorMessage={queryErrorMessage}
          togglingBranchId={togglingBranchId}
          hasActiveFilters={
            searchTerm.trim().length > 0 || statusFilter !== 'active'
          }
          onRetry={() => {
            void branchesQuery.refetch();
          }}
          onResetFilters={resetFilters}
          onAddBranch={() => setFormModalState({ open: true, branch: null })}
          onEdit={(branch) => setFormModalState({ open: true, branch })}
          onToggleActive={(branch, nextActive) => {
            void handleToggleActive(branch, nextActive);
          }}
          onGenerateToken={(branch) => {
            void requestEnrollmentToken(branch);
          }}
        />

        {showPagination ? (
          <Pagination
            className="border-border border-t px-4 py-3"
            page={page}
            pageSize={pageData.page_size || BRANCHES_PAGE_SIZE}
            itemCount={pageData.total_count}
            hasNextPage={hasNextPage}
            onPageChange={handlePageChange}
          />
        ) : null}
      </Card>

      <BranchFormModal
        open={formModalState.open}
        branch={formModalState.branch}
        onClose={() => setFormModalState({ open: false, branch: null })}
      />

      <EnrollmentTokenModal
        open={tokenModalState.open}
        branch={tokenModalState.branch}
        tokenData={tokenModalState.tokenData}
        isLoading={isGeneratingToken}
        errorMessage={tokenModalState.errorMessage}
        onRetry={() => {
          if (tokenModalState.branch) {
            void requestEnrollmentToken(tokenModalState.branch);
          }
        }}
        onClose={() =>
          setTokenModalState({
            open: false,
            branch: null,
            tokenData: null,
            errorMessage: null,
          })
        }
      />
    </div>
  );
}
