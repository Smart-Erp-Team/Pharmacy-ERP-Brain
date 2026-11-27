import { hasNextNumberedPage } from '../../../lib/api/pagination';
import { Plus } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
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
  const state = useBranchesPageState();
  const { branches, branchesQuery, page, formModalState, tokenModalState } =
    state;

  const queryErrorMessage = branchesQuery.isError
    ? branchesQuery.error instanceof ApiClientError
      ? branchesQuery.error.message
      : 'Unable to load branches.'
    : null;

  const pageData = branchesQuery.data;
  const hasNextPage = hasNextNumberedPage(pageData);
  const showPagination =
    !branchesQuery.isLoading &&
    !branchesQuery.isError &&
    pageData !== undefined &&
    (branches.length > 0 || page > 1 || hasNextPage);

  const isCloudAdmin = state.isAdmin && state.runtime === 'Cloud';
  const accessNotice =
    state.runtime !== 'Cloud'
      ? {
          title: 'Read-only mode',
          body: 'Branch changes and enrollment tokens require the Cloud deployment.',
        }
      : !state.isAdmin
        ? {
            title: 'Read-only access',
            body: 'Only administrators can create, edit, or issue enrollment tokens for branches.',
          }
        : state.branchScope === 'ASSIGNED'
          ? {
              title: 'Assigned branch scope',
              body: 'You can edit and issue enrollment tokens for your assigned branches. Creating branches or changing branch active status requires organization-wide (ALL) access.',
            }
          : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Branches"
        description="Manage pharmacy branches, status, and single-use local terminal enrollment tokens."
        actions={
          state.canCreateBranch ? (
            <Button
              variant="primary"
              leadingIcon={<Plus className="h-4 w-4" />}
              onClick={() =>
                state.setFormModalState({ open: true, branch: null })
              }
            >
              Add branch
            </Button>
          ) : undefined
        }
      />

      {accessNotice ? (
        <Alert variant="info" title={accessNotice.title}>
          {accessNotice.body}
        </Alert>
      ) : null}

      <Card>
        <BranchesFilterBar
          searchTerm={state.searchTerm}
          statusFilter={state.statusFilter}
          onSearchChange={state.handleSearchChange}
          onStatusChange={state.handleStatusChange}
        />

        <BranchesTable
          branches={branches}
          isLoading={branchesQuery.isLoading}
          errorMessage={queryErrorMessage}
          togglingBranchId={state.togglingBranchId}
          hasActiveFilters={
            state.searchTerm.trim().length > 0 ||
            state.statusFilter !== 'active'
          }
          canCreateBranch={state.canCreateBranch}
          canToggleBranchStatus={state.canToggleBranchStatus}
          canEditBranch={state.canEditBranch}
          canIssueEnrollmentToken={state.canIssueEnrollmentToken}
          showActionsWhileLoading={isCloudAdmin}
          onRetry={() => {
            void branchesQuery.refetch();
          }}
          onResetFilters={state.resetFilters}
          onAddBranch={() =>
            state.setFormModalState({ open: true, branch: null })
          }
          onEdit={(branch) => state.setFormModalState({ open: true, branch })}
          onToggleActive={(branch, nextActive) => {
            void state.handleToggleActive(branch, nextActive);
          }}
          onGenerateToken={(branch) => {
            void state.requestEnrollmentToken(branch);
          }}
        />

        {showPagination ? (
          <Pagination
            className="border-border border-t px-4 py-3"
            page={page}
            pageSize={pageData.page_size || BRANCHES_PAGE_SIZE}
            itemCount={pageData.total_count}
            hasNextPage={hasNextPage}
            onPageChange={state.handlePageChange}
          />
        ) : null}
      </Card>

      <BranchFormModal
        open={isCloudAdmin && formModalState.open}
        branch={formModalState.branch}
        canToggleStatus={state.canToggleBranchStatus}
        onClose={() => state.setFormModalState({ open: false, branch: null })}
      />

      <EnrollmentTokenModal
        open={isCloudAdmin && tokenModalState.open}
        branch={tokenModalState.branch}
        tokenData={tokenModalState.tokenData}
        isLoading={state.isGeneratingToken}
        errorMessage={tokenModalState.errorMessage}
        onRetry={() => {
          if (tokenModalState.branch) {
            void state.requestEnrollmentToken(tokenModalState.branch);
          }
        }}
        onClose={() =>
          state.setTokenModalState({
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
