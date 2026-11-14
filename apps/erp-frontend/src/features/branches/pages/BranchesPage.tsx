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
    isGeneratingToken,
    handleStatusChange,
    handlePageChange,
    handleToggleActive,
    requestEnrollmentToken,
  } = useBranchesPageState();

  const queryErrorMessage = branchesQuery.isError
    ? branchesQuery.error instanceof ApiClientError
      ? branchesQuery.error.message
      : 'Unable to load branches.'
    : null;

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
          onSearchChange={setSearchTerm}
          onStatusChange={handleStatusChange}
        />

        <BranchesTable
          branches={filteredBranches}
          isLoading={branchesQuery.isLoading}
          errorMessage={queryErrorMessage}
          togglingBranchId={togglingBranchId}
          hasActiveFilters={
            searchTerm.trim().length > 0 || statusFilter !== 'active'
          }
          onRetry={() => {
            void branchesQuery.refetch();
          }}
          onResetFilters={() => {
            setSearchTerm('');
            handleStatusChange('active');
          }}
          onAddBranch={() => setFormModalState({ open: true, branch: null })}
          onEdit={(branch) => setFormModalState({ open: true, branch })}
          onToggleActive={(branch, nextActive) => {
            void handleToggleActive(branch, nextActive);
          }}
          onGenerateToken={(branch) => {
            void requestEnrollmentToken(branch);
          }}
        />

        {!branchesQuery.isLoading &&
        !branchesQuery.isError &&
        (filteredBranches.length > 0 ||
          pageIndex > 0 ||
          Boolean(branchesQuery.data?.nextCursor)) ? (
          <Pagination
            className="border-border border-t px-4 py-3"
            page={pageIndex + 1}
            pageSize={BRANCHES_PAGE_SIZE}
            itemCount={
              pageIndex === 0 && !branchesQuery.data?.nextCursor
                ? filteredBranches.length
                : null
            }
            hasNextPage={Boolean(branchesQuery.data?.nextCursor)}
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
