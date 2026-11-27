import { useId, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'react-toastify';
import type { Branch } from '../../../features/branches';
import type { Employee } from '../../../features/employees';
import { useCreateUserMutation } from '../hooks/useUsers';
import type { DirectoryQueryStatus } from '../hooks/useUsersPageState';
import { applyCreateUserFormApiError } from '../schemas/userErrorMapper';
import {
  createUserFormSchema,
  DEFAULT_CREATE_USER_FORM_VALUES,
  toCreateUserPayload,
  type CreateUserFormValues,
} from '../schemas/userSchema';
import { CreateUserIdentityFields } from './CreateUserIdentityFields';
import { UserFormFields, type UserAccessPatch } from './UserFormFields';
import { UserFormModalShell } from './UserFormModalShell';

export interface CreateUserFormModalProps {
  eligibleEmployees: readonly Employee[];
  employeesDirectory: DirectoryQueryStatus;
  branches: readonly Branch[];
  branchesDirectory: DirectoryQueryStatus;
  onClose: () => void;
}

export function CreateUserFormModal({
  eligibleEmployees,
  employeesDirectory,
  branches,
  branchesDirectory,
  onClose,
}: CreateUserFormModalProps) {
  const formId = useId();
  const createMutation = useCreateUserMutation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserFormSchema),
    mode: 'onTouched',
    defaultValues: DEFAULT_CREATE_USER_FORM_VALUES,
  });

  const [role, branchScope, branchIds] = useWatch({
    control: form.control,
    name: ['role', 'branch_scope', 'branch_ids'],
  });
  const { errors } = form.formState;
  const isPending = createMutation.isPending;
  const hasNoEligibleEmployees =
    !employeesDirectory.isLoading &&
    !employeesDirectory.isError &&
    eligibleEmployees.length === 0;

  const isEmployeeSelectionBlocked =
    employeesDirectory.isLoading ||
    employeesDirectory.isError ||
    hasNoEligibleEmployees;

  const handleClose = () => {
    if (!isPending) onClose();
  };

  const handleAccessChange = (patch: UserAccessPatch) => {
    if (patch.role) {
      form.setValue('role', patch.role, { shouldDirty: true });
    }
    if (patch.branch_scope) {
      form.setValue('branch_scope', patch.branch_scope, { shouldDirty: true });
      form.clearErrors('branch_scope');
      if (patch.branch_scope === 'ALL') {
        form.clearErrors('branch_ids');
      }
    }
    if (patch.branch_ids) {
      form.setValue('branch_ids', patch.branch_ids, {
        shouldDirty: true,
        shouldTouch: true,
      });
    }
    if (patch.role) void form.trigger('role');
    if (patch.branch_scope) void form.trigger('branch_scope');
    if (patch.branch_ids) void form.trigger('branch_ids');
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (isPending || isEmployeeSelectionBlocked) return;
    setSubmitError(null);
    try {
      await createMutation.mutateAsync({
        payload: toCreateUserPayload(values),
      });
      toast.success(`User account "${values.username.trim()}" created`);
      onClose();
    } catch (error) {
      const formError = applyCreateUserFormApiError(error, form.setError);
      if (formError) {
        setSubmitError(formError);
        toast.error(formError);
      }
    }
  });

  return (
    <UserFormModalShell
      formId={formId}
      eyebrow="New user account"
      title="Create user account"
      submitLabel="Create user"
      errorTitle="Could not create user account"
      submitError={submitError}
      isPending={isPending}
      isSubmitDisabled={isPending || isEmployeeSelectionBlocked}
      employeesDirectory={employeesDirectory}
      branchesDirectory={branchesDirectory}
      onClose={handleClose}
      onSubmit={onSubmit}
    >
      <CreateUserIdentityFields
        eligibleEmployees={eligibleEmployees}
        employeesDirectory={employeesDirectory}
        hasNoEligibleEmployees={hasNoEligibleEmployees}
        disabled={isPending}
        register={form.register}
        errors={errors}
      />
      <UserFormFields
        role={role}
        branchScope={branchScope}
        branchIds={branchIds}
        branches={branches}
        branchesDirectory={branchesDirectory}
        disabled={isPending}
        roleError={errors.role?.message}
        branchScopeError={errors.branch_scope?.message}
        branchIdsError={errors.branch_ids?.message}
        onAccessChange={handleAccessChange}
      />
    </UserFormModalShell>
  );
}
