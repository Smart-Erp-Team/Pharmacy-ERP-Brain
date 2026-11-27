import { useId, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'react-toastify';
import type { Branch } from '../../../features/branches';
import { useAuth } from '../../../hooks/useAuth';
import type { User } from '../../../types/api';
import { usePatchUserMutation } from '../hooks/useUsers';
import {
  hasEffectiveEditChanges,
  resolveEffectiveEditValues,
  type DirectoryQueryStatus,
  type EmployeeDisplay,
} from '../hooks/useUsersPageState';
import { applyEditUserFormApiError } from '../schemas/userErrorMapper';
import {
  createEditUserFormSchema,
  toUserPatchPayload,
  userDtoToEditFormValues,
  type EditUserFormValues,
} from '../schemas/userSchema';
import { EditUserFormFields } from './EditUserFormFields';
import { type UserAccessPatch } from './UserFormFields';
import { UserFormModalShell } from './UserFormModalShell';

export interface EditUserFormModalProps {
  user: User;
  employeeDisplay: EmployeeDisplay;
  branches: readonly Branch[];
  branchesDirectory: DirectoryQueryStatus;
  isOrgAdmin: boolean;
  allowedBranchIds: readonly string[];
  onClose: () => void;
}

export function EditUserFormModal({
  user,
  employeeDisplay,
  branches,
  branchesDirectory,
  isOrgAdmin,
  allowedBranchIds,
  onClose,
}: EditUserFormModalProps) {
  const formId = useId();
  const { currentUser } = useAuth();
  const isSelf = currentUser?.user_id === user.user_id;
  const patchMutation = usePatchUserMutation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(createEditUserFormSchema()),
    mode: 'onTouched',
    defaultValues: userDtoToEditFormValues(user),
  });
  const watched = useWatch({ control: form.control });
  const currentValues = resolveEffectiveEditValues(watched, user, isSelf);
  const isPending = patchMutation.isPending;
  const hasEffectiveChanges = hasEffectiveEditChanges(currentValues, user);

  const handleAccessChange = (patch: UserAccessPatch) => {
    if (!isSelf && patch.role && (isOrgAdmin || patch.role !== 'Admin')) {
      form.setValue('role', patch.role, { shouldDirty: true });
      void form.trigger('role');
    }
    if (
      !isSelf &&
      patch.branch_scope &&
      (isOrgAdmin || patch.branch_scope !== 'ALL')
    ) {
      form.setValue('branch_scope', patch.branch_scope, { shouldDirty: true });
      form.clearErrors('branch_scope');
      if (patch.branch_scope === 'ALL') {
        form.setValue('branch_ids', [...user.branch_ids], {
          shouldDirty: false,
        });
        form.clearErrors('branch_ids');
      }
      void form.trigger('branch_scope');
    }
    if (patch.branch_ids) {
      form.setValue('branch_ids', patch.branch_ids, {
        shouldDirty: true,
        shouldTouch: true,
      });
      void form.trigger('branch_ids');
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (isPending || !hasEffectiveChanges) return;
    setSubmitError(null);
    const safeValues = resolveEffectiveEditValues(values, user, isSelf);
    try {
      await patchMutation.mutateAsync({
        userId: user.user_id,
        payload: toUserPatchPayload(safeValues, user),
      });
      toast.success(`User account "${user.username}" updated`);
      onClose();
    } catch (error) {
      const formError = applyEditUserFormApiError(error, form.setError);
      if (formError) {
        setSubmitError(formError);
        toast.error(formError);
      }
    }
  });

  return (
    <UserFormModalShell
      formId={formId}
      eyebrow="User account"
      title={`Edit ${user.username}`}
      submitLabel="Save changes"
      errorTitle="Could not update user account"
      submitError={submitError}
      isPending={isPending}
      isSubmitDisabled={isPending || !hasEffectiveChanges}
      branchesDirectory={branchesDirectory}
      onClose={() => {
        if (!isPending) onClose();
      }}
      onSubmit={onSubmit}
    >
      <EditUserFormFields
        employeeDisplay={employeeDisplay}
        username={user.username}
        values={currentValues}
        isSelf={isSelf}
        isOrgAdmin={isOrgAdmin}
        allowedBranchIds={allowedBranchIds}
        branches={branches}
        branchesDirectory={branchesDirectory}
        disabled={isPending}
        errors={form.formState.errors}
        onAccessChange={handleAccessChange}
        onStatusChange={(nextActive) => {
          if (isSelf) return;
          form.setValue('is_active', nextActive, {
            shouldDirty: true,
            shouldValidate: true,
          });
          form.clearErrors('is_active');
        }}
      />
    </UserFormModalShell>
  );
}
