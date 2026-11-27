import { useId, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import type { Branch } from '../../../types/api';
import {
  useCreateBranchMutation,
  usePatchBranchMutation,
} from '../hooks/useBranches';
import { applyBranchFormApiError } from '../schemas/branchErrorMapper';
import {
  branchDtoToFormValues,
  branchFormSchema,
  DEFAULT_BRANCH_FORM_VALUES,
  toBranchCreatePayload,
  toBranchPatchPayload,
  type BranchFormValues,
} from '../schemas/branchSchema';
import { BranchFormFields } from './BranchFormFields';

export interface BranchFormModalProps {
  open: boolean;
  branch: Branch | null;
  canToggleStatus?: boolean;
  onClose: () => void;
}

function BranchFormModalContent({
  branch,
  canToggleStatus,
  onClose,
}: Omit<BranchFormModalProps, 'open'> & { canToggleStatus: boolean }) {
  const isEdit = branch !== null;
  const formId = useId();
  const createMutation = useCreateBranchMutation();
  const patchMutation = usePatchBranchMutation();
  const isPending = createMutation.isPending || patchMutation.isPending;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<BranchFormValues>({
    resolver: zodResolver(branchFormSchema),
    mode: 'onTouched',
    defaultValues: branch
      ? branchDtoToFormValues(branch)
      : DEFAULT_BRANCH_FORM_VALUES,
  });

  const handleClose = () => {
    if (!isPending) onClose();
  };

  const onSubmit = async (values: BranchFormValues) => {
    if (isPending || (isEdit && !isDirty)) return;
    setSubmitError(null);
    try {
      if (branch) {
        await patchMutation.mutateAsync({
          branchId: branch.branch_id,
          payload: toBranchPatchPayload(values, canToggleStatus),
        });
        toast.success(`Branch "${values.name.trim()}" updated`);
      } else {
        await createMutation.mutateAsync({
          payload: toBranchCreatePayload(values),
        });
        toast.success(`Branch "${values.name.trim()}" created`);
      }
      onClose();
    } catch (error) {
      const formError = applyBranchFormApiError(error, setError);
      if (formError) {
        setSubmitError(formError);
        toast.error(formError);
      }
    }
  };

  return (
    <Modal
      open
      onClose={handleClose}
      eyebrow={isEdit ? 'Branch directory' : 'New branch'}
      title={isEdit ? `Edit ${branch.name}` : 'Add branch'}
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
            {isEdit ? 'Save changes' : 'Create branch'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        {submitError ? (
          <Alert variant="danger" title="Could not save branch">
            {submitError}
          </Alert>
        ) : null}

        {!isEdit ? (
          <Alert variant="info">
            Creating a branch automatically initializes SELLABLE, QUARANTINE,
            and SCRAP inventory locations.
          </Alert>
        ) : null}

        <BranchFormFields
          isEdit={isEdit}
          canToggleStatus={canToggleStatus}
          disabled={isPending}
          register={register}
          control={control}
          errors={errors}
        />
      </form>
    </Modal>
  );
}

export function BranchFormModal({
  open,
  branch,
  canToggleStatus = true,
  onClose,
}: BranchFormModalProps) {
  if (!open) {
    return null;
  }

  return (
    <BranchFormModalContent
      key={branch?.branch_id ?? 'new'}
      branch={branch}
      canToggleStatus={canToggleStatus}
      onClose={onClose}
    />
  );
}
