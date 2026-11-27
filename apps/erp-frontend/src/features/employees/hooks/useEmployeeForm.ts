import type { UseFormRegister } from 'react-hook-form';
import { useId, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import type { SelectOption } from '../../../components/ui/Select';
import type { Branch } from '../../../features/branches';
import type { AddressDto, Employee } from '../../../types/api';
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
  branches: readonly Branch[],
  isBranchesLoading: boolean,
  isBranchesError: boolean,
  isEdit: boolean,
  currentBranchId: string
): SelectOption[] {
  if (isEdit) {
    if (isBranchesError) {
      return [{ value: currentBranchId, label: 'Branch unavailable' }];
    }
    if (isBranchesLoading) {
      return [{ value: currentBranchId, label: 'Loading branch...' }];
    }
    const matched = branches.find(
      (branch) => branch.branch_id === currentBranchId
    );
    return [
      {
        value: currentBranchId,
        label: matched
          ? `${matched.branch_code} — ${matched.name}`
          : 'Branch unavailable',
      },
    ];
  }

  if (isBranchesError) {
    return [{ value: '', label: 'Branch unavailable' }];
  }
  if (isBranchesLoading) {
    return [{ value: '', label: 'Loading branches...' }];
  }

  return [
    { value: '', label: 'Select home branch' },
    ...branches
      .filter((branch) => branch.is_active)
      .map((branch) => ({
        value: branch.branch_id,
        label: `${branch.branch_code} — ${branch.name}`,
      })),
  ];
}

export function buildEmployeeAddressRegistrations(
  register: UseFormRegister<EmployeeFormValues>
) {
  const fields: Record<
    keyof AddressDto,
    ReturnType<UseFormRegister<EmployeeFormValues>>
  > = {
    line1: register('address.line1'),
    line2: register('address.line2'),
    city: register('address.city'),
    region: register('address.region'),
    postal_code: register('address.postal_code'),
    country_code: register('address.country_code'),
  };
  return fields;
}

export interface UseEmployeeFormOptions {
  employee: Employee | null;
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
