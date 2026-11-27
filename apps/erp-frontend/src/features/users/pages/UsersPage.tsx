import { Plus } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { PageHeading } from '../../../components/ui/PageHeading';
import { Pagination } from '../../../components/ui/Pagination';
import { ApiClientError } from '../../../lib/api/client';
import { ResetPasswordModal } from '../components/ResetPasswordModal';
import { RevokeSessionsModal } from '../components/RevokeSessionsModal';
import { UserFormModal } from '../components/UserFormModal';
import { UsersFilterBar } from '../components/UsersFilterBar';
import { UsersTable } from '../components/UsersTable';
import { useUsersPageState } from '../hooks/useUsersPageState';

export function UsersPage() {
  const state = useUsersPageState();
  const { usersQuery, filteredUsers, page, pageSize, totalCount, hasNextPage } =
    state;

  const queryErrorMessage = usersQuery.isError
    ? usersQuery.error instanceof ApiClientError
      ? usersQuery.error.message
      : 'Unable to load user accounts.'
    : null;

  const hasActiveFilters =
    state.searchTerm.trim().length > 0 ||
    (state.isOrgAdmin
      ? state.branchFilter !== ''
      : state.branchFilter !== state.defaultAssignedBranchId) ||
    state.roleFilter !== 'all' ||
    state.statusFilter !== 'active';

  const showPagination =
    !usersQuery.isPending &&
    !usersQuery.isError &&
    (filteredUsers.length > 0 || page > 1 || hasNextPage);

  const openCreateModal = () => {
    if (state.canWrite) state.setFormModalState({ open: true, user: null });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow="Organization & Identity"
        title="User Accounts"
        description="Manage user accounts, roles, branch access scope, and session security."
        actions={
          state.canWrite ? (
            <Button
              variant="primary"
              leadingIcon={<Plus className="h-4 w-4" />}
              onClick={openCreateModal}
            >
              Add user
            </Button>
          ) : undefined
        }
      />
      {!state.canWrite ? (
        <Alert variant="info" title="Read-only mode">
          User account changes require the Cloud deployment.
        </Alert>
      ) : !state.isOrgAdmin ? (
        <Alert variant="info" title="Assigned branch administration">
          You can manage Pharmacist and Cashier accounts within your assigned
          branches. Admin and organization-wide (ALL) accounts are read-only.
        </Alert>
      ) : null}
      <Card>
        <UsersFilterBar
          searchTerm={state.searchTerm}
          branchFilter={state.branchFilter}
          roleFilter={state.roleFilter}
          statusFilter={state.statusFilter}
          branches={state.branches}
          isBranchesError={state.branchesDirectory.isError}
          isOrgAdmin={state.isOrgAdmin}
          allowedBranchIds={state.allowedBranchIds}
          onSearchChange={state.setSearchTerm}
          onBranchChange={state.handleBranchChange}
          onRoleChange={state.handleRoleChange}
          onStatusChange={state.handleStatusChange}
        />
        <UsersTable
          users={filteredUsers}
          currentUserId={state.currentUserId}
          canWrite={state.canWrite}
          canManageUser={state.canManageUser}
          getEmployeeDisplay={state.getEmployeeDisplay}
          getBranchAccessDisplay={state.getBranchAccessDisplay}
          referenceNowMs={state.referenceNowMs}
          isLoading={usersQuery.isPending}
          errorMessage={queryErrorMessage}
          togglingUserIds={state.togglingUserIds}
          hasActiveFilters={hasActiveFilters}
          onRetry={() => void usersQuery.refetch()}
          onResetFilters={state.resetFilters}
          onAddUser={openCreateModal}
          onEdit={(user) => {
            if (state.canManageUser(user))
              state.setFormModalState({ open: true, user });
          }}
          onResetPassword={(user) => {
            if (state.canManageUser(user)) state.setResetPasswordUser(user);
          }}
          onRevokeSessions={(user) => {
            if (state.canManageUser(user)) state.setRevokeSessionsUser(user);
          }}
          onToggleActive={(user, nextActive) =>
            void state.handleToggleActive(user, nextActive)
          }
        />

        {showPagination ? (
          <Pagination
            className="border-border border-t px-4 py-3"
            page={page}
            pageSize={pageSize}
            itemCount={totalCount}
            hasNextPage={hasNextPage}
            onPageChange={state.handlePageChange}
          />
        ) : null}
      </Card>

      <UserFormModal
        open={state.canWrite && state.formModalState.open}
        user={state.formModalState.user}
        eligibleEmployees={state.eligibleEmployees}
        getEmployeeDisplay={state.getEmployeeDisplay}
        employeesDirectory={state.employeesDirectory}
        branches={state.branches}
        branchesDirectory={state.branchesDirectory}
        isOrgAdmin={state.isOrgAdmin}
        allowedBranchIds={state.allowedBranchIds}
        onClose={() => state.setFormModalState({ open: false, user: null })}
      />

      {state.canWrite && state.resetPasswordUser ? (
        <ResetPasswordModal
          key={state.resetPasswordUser.user_id}
          user={state.resetPasswordUser}
          onClose={() => state.setResetPasswordUser(null)}
        />
      ) : null}

      {state.canWrite && state.revokeSessionsUser ? (
        <RevokeSessionsModal
          key={state.revokeSessionsUser.user_id}
          user={state.revokeSessionsUser}
          onClose={() => state.setRevokeSessionsUser(null)}
        />
      ) : null}
    </div>
  );
}
