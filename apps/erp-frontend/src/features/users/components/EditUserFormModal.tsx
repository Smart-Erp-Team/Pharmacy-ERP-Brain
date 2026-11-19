import { useId, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'react-toastify';
import type { BranchDto, UserDto } from '../../../types/api';
import { usePatchUserMutation } from '../hooks/useUsers';
import type {
  DirectoryQueryStatus,
  EmployeeDisplay,
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
  user: UserDto;
  employeeDisplay: EmployeeDisplay;
  branches: readonly BranchDto[];
  branchesDirectory: DirectoryQueryStatus;
  onClose: () => void;
}

export function EditUserFormModal({
  user,
  employeeDisplay,
  branches,
  branchesDirectory,
  onClose,
}: EditUserFormModalProps) {
  const formId = useId();
  const patchMutation = usePatchUserMutation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(createEditUserFormSchema(user.branch_scope)),
    mode: 'onTouched',
    defaultValues: userDtoToEditFormValues(user),
  });
  const watched = useWatch({ control: form.control });
  const role = watched.role ?? user.role;
  const branchScope = watched.branch_scope ?? user.branch_scope;
  const branchIds = watched.branch_ids ?? [];
  const hasBranchAccessEdit = watched.has_branch_access_edit ?? false;
  const isActive = watched.is_active ?? user.is_active;
  const { errors } = form.formState;
  const isPending = patchMutation.isPending;
  const hasEffectiveChanges =
    role !== user.role ||
    branchScope !== user.branch_scope ||
    isActive !== user.is_active ||
    (branchScope === 'ASSIGNED' &&
      (hasBranchAccessEdit || branchIds.length > 0));
  const handleClose = () => {
    if (!isPending) onClose();
  };

  const handleAccessChange = (patch: UserAccessPatch) => {
    if (patch.role) form.setValue('role', patch.role, { shouldDirty: true });
    if (patch.branch_scope) {
      form.setValue('branch_scope', patch.branch_scope, { shouldDirty: true });
      form.clearErrors('branch_scope');
      if (patch.branch_scope === 'ALL') {
        form.resetField('branch_ids');
        form.resetField('has_branch_access_edit');
        form.clearErrors('branch_ids');
      }
    }
    if (patch.branch_ids) {
      form.setValue('branch_ids', patch.branch_ids, {
        shouldDirty: true,
        shouldTouch: true,
      });
      if (!hasBranchAccessEdit) {
        form.setValue('has_branch_access_edit', true, { shouldDirty: true });
      }
    }
    if (patch.role) void form.trigger('role');
    if (patch.branch_scope) void form.trigger('branch_scope');
    if (patch.branch_ids) void form.trigger('branch_ids');
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (isPending || !hasEffectiveChanges) return;
    setSubmitError(null);
    try {
      await patchMutation.mutateAsync({
        userId: user.user_id,
        payload: toUserPatchPayload(values, user.branch_scope),
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
      onClose={handleClose}
      onSubmit={onSubmit}
    >
      <EditUserFormFields
        employeeDisplay={employeeDisplay}
        username={user.username}
        role={role}
        branchScope={branchScope}
        branchIds={branchIds}
        isActive={isActive}
        showPreservedGrantsNotice={
          user.branch_scope === 'ASSIGNED' &&
          branchScope === 'ASSIGNED' &&
          !hasBranchAccessEdit
        }
        branches={branches}
        branchesDirectory={branchesDirectory}
        disabled={isPending}
        errors={errors}
        onAccessChange={handleAccessChange}
        onStatusChange={(nextActive) => {
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
