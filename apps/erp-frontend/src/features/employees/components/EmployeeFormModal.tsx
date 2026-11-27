import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import type { Branch } from '../../../features/branches';
import type { Employee } from '../../../types/api';
import { useEmployeeForm } from '../hooks/useEmployeeForm';
import { EmployeeFormFields } from './EmployeeFormFields';

export interface EmployeeFormModalProps {
  open: boolean;
  employee: Employee | null;
  branches: readonly Branch[];
  isBranchesLoading: boolean;
  isBranchesError: boolean;
  isRetryingBranches?: boolean;
  onRetryBranches: () => void;
  onClose: () => void;
}

type EmployeeFormModalContentProps = Omit<EmployeeFormModalProps, 'open'>;

function EmployeeFormModalContent({
  employee,
  branches,
  isBranchesLoading,
  isBranchesError,
  isRetryingBranches = false,
  onRetryBranches,
  onClose,
}: EmployeeFormModalContentProps) {
  const {
    isEdit,
    formId,
    isPending,
    submitError,
    register,
    control,
    errors,
    isDirty,
    handleClose,
    handleFormSubmit,
  } = useEmployeeForm({ employee, onClose });

  return (
    <Modal
      open
      onClose={handleClose}
      eyebrow={isEdit ? 'Employee register' : 'New employee'}
      title={employee ? `Edit ${employee.full_name}` : 'Add employee'}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={isPending || (isEdit && !isDirty)}
            isLoading={isPending}
          >
            {isEdit ? 'Save changes' : 'Create employee'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={handleFormSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        {submitError ? (
          <Alert variant="danger" title="Could not save employee">
            {submitError}
          </Alert>
        ) : null}

        {isBranchesError ? (
          <Alert variant="warning" title="Branches unavailable">
            <div className="flex items-center justify-between gap-3">
              <span>Home branch options could not be loaded.</span>
              <Button
                variant="secondary"
                onClick={onRetryBranches}
                disabled={isRetryingBranches}
                isLoading={isRetryingBranches}
              >
                Retry
              </Button>
            </div>
          </Alert>
        ) : null}

        <EmployeeFormFields
          isEdit={isEdit}
          disabled={isPending}
          branches={branches}
          isBranchesLoading={isBranchesLoading}
          isBranchesError={isBranchesError}
          currentBranchId={employee?.branch_id ?? ''}
          register={register}
          control={control}
          errors={errors}
        />
      </form>
    </Modal>
  );
}

export function EmployeeFormModal({
  open,
  employee,
  branches,
  isBranchesLoading,
  isBranchesError,
  isRetryingBranches = false,
  onRetryBranches,
  onClose,
}: EmployeeFormModalProps) {
  if (!open) {
    return null;
  }

  return (
    <EmployeeFormModalContent
      key={employee?.employee_id ?? 'new'}
      employee={employee}
      branches={branches}
      isBranchesLoading={isBranchesLoading}
      isBranchesError={isBranchesError}
      isRetryingBranches={isRetryingBranches}
      onRetryBranches={onRetryBranches}
      onClose={onClose}
    />
  );
}
