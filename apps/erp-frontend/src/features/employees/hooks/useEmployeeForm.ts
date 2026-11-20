import { useId, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import type { SelectOption } from '../../../components/ui/Select';
import type { BranchDto, EmployeeDto } from '../../../types/api';
import { applyEmployeeFormApiError } from '../schemas/employeeErrorMapper';
import {
  DEFAULT_EMPLOYEE_FORM_VALUES,
  employeeDtoToFormValues,
  employeeFormSchema,
  toEmployeeCreatePayload,
  toEmployeePatchPayload,
  type EmployeeFormValues,
} from '../schemas/employeeSchema';
import {
  useCreateEmployeeMutation,
  usePatchEmployeeMutation,
} from './useEmployees';

export function buildEmployeeBranchOptions(
  branches: readonly BranchDto[],
  isBranchesLoading: boolean,
  isBranchesError: boolean,
  isEdit: boolean,
  currentBranchId: string
): SelectOption[] {
  if (isBranchesError) {
    return isEdit && currentBranchId
      ? [{ value: currentBranchId, label: 'Branch unavailable' }]
      : [{ value: '', label: 'Branch unavailable' }];
  }
  if (isBranchesLoading) {
    return isEdit && currentBranchId
      ? [{ value: currentBranchId, label: 'Loading branch...' }]
      : [{ value: '', label: 'Loading branches...' }];
  }

  const eligibleBranches = branches.filter(
    (branch) => branch.is_active || branch.branch_id === currentBranchId
  );

  const options: SelectOption[] = [
    { value: '', label: 'Select home branch' },
    ...eligibleBranches.map((branch) => ({
      value: branch.branch_id,
      label: `${branch.code} — ${branch.name}`,
    })),
  ];

  if (
    isEdit &&
    currentBranchId &&
    !eligibleBranches.some((branch) => branch.branch_id === currentBranchId)
  ) {
    options.push({ value: currentBranchId, label: 'Branch unavailable' });
  }

  return options;
}

export interface UseEmployeeFormOptions {
  employee: EmployeeDto | null;
  onClose: () => void;
}

export function useEmployeeForm({ employee, onClose }: UseEmployeeFormOptions) {
  const isEdit = employee !== null;
  const formId = useId();
  const createMutation = useCreateEmployeeMutation();
  const patchMutation = usePatchEmployeeMutation();
  const isPending = createMutation.isPending || patchMutation.isPending;
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    mode: 'onTouched',
    defaultValues: employee
      ? employeeDtoToFormValues(employee)
      : DEFAULT_EMPLOYEE_FORM_VALUES,
  });

  const handleClose = () => {
    if (!isPending) {
      onClose();
    }
  };

  const handleFormSubmit = form.handleSubmit(async (values) => {
    if (isPending || (isEdit && !form.formState.isDirty)) {
      return;
    }

    setSubmitError(null);
    try {
      if (employee) {
        await patchMutation.mutateAsync({
          employeeId: employee.employee_id,
          payload: toEmployeePatchPayload(values),
        });
        toast.success(`Employee "${values.full_name.trim()}" updated`);
      } else {
        await createMutation.mutateAsync({
          payload: toEmployeeCreatePayload(values),
        });
        toast.success(`Employee "${values.full_name.trim()}" created`);
      }
      onClose();
    } catch (error) {
      const formError = applyEmployeeFormApiError(error, form.setError);
      if (formError) {
        setSubmitError(formError);
        toast.error(formError);
      }
    }
  });

  return {
    isEdit,
    formId,
    isPending,
    submitError,
    register: form.register,
    control: form.control,
    errors: form.formState.errors,
    isDirty: form.formState.isDirty,
    handleClose,
    handleFormSubmit,
  };
}
