import { Plus } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { PageHeading } from '../../../components/ui/PageHeading';
import { Pagination } from '../../../components/ui/Pagination';
import { ApiClientError } from '../../../lib/api/client';
import { EmployeeFormModal } from '../components/EmployeeFormModal';
import { EmployeesFilterBar } from '../components/EmployeesFilterBar';
import { EmployeesTable } from '../components/EmployeesTable';
import { useEmployeesPageState } from '../hooks/useEmployeesPageState';

export function EmployeesPage() {
  const {
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
  } = useEmployeesPageState();

  const queryErrorMessage = employeesQuery.isError
    ? employeesQuery.error instanceof ApiClientError
      ? employeesQuery.error.message
      : 'Unable to load employees.'
    : null;

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    branchFilter !== '' ||
    statusFilter !== 'active';

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow="Organization & Identity"
        title="Employees"
        description="Manage employees, home branch assignments, job roles, and account status."
        actions={
          <Button
            variant="primary"
            leadingIcon={<Plus className="h-4 w-4" />}
            onClick={() => setFormModalState({ open: true, employee: null })}
          >
            Add employee
          </Button>
        }
      />

      <Card>
        <EmployeesFilterBar
          searchTerm={searchTerm}
          branchId={branchFilter}
          statusFilter={statusFilter}
          branches={branches}
          isBranchesError={branchesQuery.isError}
          onSearchChange={handleSearchChange}
          onBranchChange={handleBranchChange}
          onStatusChange={handleStatusChange}
        />

        <EmployeesTable
          employees={employees}
          getBranchLabel={getBranchLabel}
          isLoading={employeesQuery.isPending}
          errorMessage={queryErrorMessage}
          togglingEmployeeId={togglingEmployeeId}
          hasActiveFilters={hasActiveFilters}
          onRetry={() => {
            void employeesQuery.refetch();
          }}
          onResetFilters={resetFilters}
          onAddEmployee={() =>
            setFormModalState({ open: true, employee: null })
          }
          onEdit={(employee) => setFormModalState({ open: true, employee })}
          onToggleActive={(employee, nextActive) => {
            void handleToggleActive(employee, nextActive);
          }}
        />

        {!employeesQuery.isPending &&
        !employeesQuery.isError &&
        (employees.length > 0 || page > 1 || hasNextPage) ? (
          <Pagination
            className="border-border border-t px-4 py-3"
            page={page}
            pageSize={pageSize}
            itemCount={totalCount}
            hasNextPage={hasNextPage}
            onPageChange={handlePageChange}
          />
        ) : null}
      </Card>

      <EmployeeFormModal
        open={formModalState.open}
        employee={formModalState.employee}
        branches={branches}
        isBranchesLoading={
          branchesQuery.isPending ||
          (branchesQuery.isError && branchesQuery.isFetching)
        }
        isBranchesError={branchesQuery.isError}
        isRetryingBranches={branchesQuery.isFetching}
        onRetryBranches={() => {
          void branchesQuery.refetch();
        }}
        onClose={() => setFormModalState({ open: false, employee: null })}
      />
    </div>
  );
}
