import { Plus } from 'lucide-react';
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
    state.branchFilter !== '' ||
    state.roleFilter !== 'all' ||
    state.statusFilter !== 'active';

  const showPagination =
    !usersQuery.isPending &&
    !usersQuery.isError &&
    (filteredUsers.length > 0 || page > 1 || hasNextPage);

  const openCreateModal = () =>
    state.setFormModalState({ open: true, user: null });

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow="Organization & Identity"
        title="User Accounts"
        description="Manage user accounts, roles, branch access scope, and session security."
        actions={
          <Button
            variant="primary"
            leadingIcon={<Plus className="h-4 w-4" />}
            onClick={openCreateModal}
          >
            Add user
          </Button>
        }
      />

      <Card>
        <UsersFilterBar
          searchTerm={state.searchTerm}
          branchFilter={state.branchFilter}
          roleFilter={state.roleFilter}
          statusFilter={state.statusFilter}
          branches={state.branches}
          isBranchesError={state.branchesDirectory.isError}
          onSearchChange={state.setSearchTerm}
          onBranchChange={state.handleBranchChange}
          onRoleChange={state.handleRoleChange}
          onStatusChange={state.handleStatusChange}
        />

        <UsersTable
          users={filteredUsers}
          currentUserId={state.currentUserId}
          getEmployeeDisplay={state.getEmployeeDisplay}
          getBranchAccessDisplay={state.getBranchAccessDisplay}
          referenceNowMs={state.referenceNowMs}
          isLoading={usersQuery.isPending}
          errorMessage={queryErrorMessage}
          togglingUserIds={state.togglingUserIds}
          hasActiveFilters={hasActiveFilters}
          onRetry={() => {
            void usersQuery.refetch();
          }}
          onResetFilters={state.resetFilters}
          onAddUser={openCreateModal}
          onEdit={(user) => state.setFormModalState({ open: true, user })}
          onResetPassword={(user) => state.setResetPasswordUser(user)}
          onRevokeSessions={(user) => state.setRevokeSessionsUser(user)}
          onToggleActive={(user, nextActive) => {
            void state.handleToggleActive(user, nextActive);
          }}
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
        open={state.formModalState.open}
        user={state.formModalState.user}
        eligibleEmployees={state.eligibleEmployees}
        getEmployeeDisplay={state.getEmployeeDisplay}
        employeesDirectory={state.employeesDirectory}
        branches={state.branches}
        branchesDirectory={state.branchesDirectory}
        onClose={() => state.setFormModalState({ open: false, user: null })}
      />

      {state.resetPasswordUser ? (
        <ResetPasswordModal
          key={state.resetPasswordUser.user_id}
          user={state.resetPasswordUser}
          onClose={() => state.setResetPasswordUser(null)}
        />
      ) : null}

      {state.revokeSessionsUser ? (
        <RevokeSessionsModal
          key={state.revokeSessionsUser.user_id}
          user={state.revokeSessionsUser}
          onClose={() => state.setRevokeSessionsUser(null)}
        />
      ) : null}
    </div>
  );
}
