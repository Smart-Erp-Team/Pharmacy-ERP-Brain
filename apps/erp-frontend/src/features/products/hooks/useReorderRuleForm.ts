import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'react-toastify';
import type { SelectOption } from '../../../components/ui/Select';
import { useBranchesQuery } from '../../../features/branches';
import { useAuth } from '../../../hooks/useAuth';
import type { BranchDto, ProductDto, ReorderRuleDto } from '../../../types/api';
import { usePutReorderRuleMutation } from './useCatalogMutations';
import { useReorderRuleQuery } from './useCatalogQueries';
import { applyReorderRuleFormApiError } from '../schemas/catalogErrorMapper';
import {
  reorderRuleDtoToFormValues,
  reorderRuleFormSchema,
  toReorderRulePayload,
  type ReorderRuleFormValues,
} from '../schemas/uomReorderSchema';

const optVal = (o: SelectOption | undefined) =>
  typeof o === 'string' ? o : (o?.value ?? '');

export function useBranchReorderTab(productId: string) {
  const {
    hasRole,
    hasAnyRole,
    can,
    runtime,
    activeBranchId,
    branchIds,
    canAccessBranch,
  } = useAuth();
  const isAdmin = hasRole('Admin');
  const canRead = hasAnyRole(['Admin', 'Pharmacist']) && can('inventory:read');
  const canWrite = canRead && can('inventory:write') && runtime === 'Cloud';
  const branchesQ = useBranchesQuery(
    { includeInactive: false, limit: 200 },
    { enabled: canRead && isAdmin }
  );
  const loaded: readonly BranchDto[] = branchesQ.data?.items ?? [];
  const assignedIds =
    branchIds.length > 0 ? branchIds : activeBranchId ? [activeBranchId] : [];
  const options: readonly SelectOption[] = isAdmin
    ? loaded
        .filter((b) => canAccessBranch(b.branch_id))
        .map((b) => ({ value: b.branch_id, label: `${b.code} — ${b.name}` }))
    : assignedIds.map((id) => ({
        value: id,
        label: `Branch ${id.slice(0, 8)}`,
      }));
  const [selectedId, setSelectedId] = useState('');
  const branchId = options.some((o) => optVal(o) === selectedId)
    ? selectedId
    : activeBranchId && options.some((o) => optVal(o) === activeBranchId)
      ? activeBranchId
      : optVal(options[0]);
  const ruleQ = useReorderRuleQuery(branchId, productId, { enabled: canRead });

  return {
    isAdmin,
    canRead,
    canWrite,
    runtime,
    branchesQ,
    options,
    branchId,
    setSelectedId,
    ruleQ,
  };
}

export function useReorderRuleForm(
  branchId: string,
  product: ProductDto,
  rule: ReorderRuleDto | null,
  canWrite: boolean
) {
  const putMut = usePutReorderRuleMutation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    clearErrors,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<ReorderRuleFormValues>({
    resolver: zodResolver(reorderRuleFormSchema),
    mode: 'onTouched',
    defaultValues: reorderRuleDtoToFormValues(rule),
  });
  const isActive = useWatch({ control, name: 'is_active' });

  const setActive = (next: boolean) => {
    setValue('is_active', next, {
      shouldDirty: true,
      shouldValidate: true,
    });
    clearErrors('is_active');
  };

  const onSubmit = handleSubmit(async (values) => {
    if (!canWrite || putMut.isPending || !isDirty) return;
    setSubmitError(null);
    try {
      const saved = await putMut.mutateAsync({
        branchId,
        productId: product.product_id,
        payload: toReorderRulePayload(values),
      });
      reset(reorderRuleDtoToFormValues(saved));
      toast.success(`Reorder rule saved for ${product.name}`);
    } catch (error) {
      const msg = applyReorderRuleFormApiError(error, setError);
      if (msg) {
        setSubmitError(msg);
        toast.error(msg);
      }
    }
  });

  return {
    isPending: putMut.isPending,
    isDirty,
    submitError,
    errors,
    isActive,
    register,
    setActive,
    onSubmit,
  };
}
