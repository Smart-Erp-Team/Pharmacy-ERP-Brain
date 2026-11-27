import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'react-toastify';
import type { SelectOption } from '../../../components/ui/Select';
import { useAllBranchesQuery, type Branch } from '../../../features/branches';
import { useAuth } from '../../../hooks/useAuth';
import type { Product, ReorderRule } from '../../../types/api';
import { useUpsertReorderRuleMutation } from './useCatalogMutations';
import { useReorderRuleQuery } from './useCatalogQueries';
import { applyReorderRuleFormApiError } from '../schemas/catalogErrorMapper';
import {
  reorderRuleDtoToFormValues,
  reorderRuleFormSchema,
  toUpsertReorderRulePayload,
  type ReorderRuleFormValues,
} from '../schemas/uomReorderSchema';

const optVal = (o: SelectOption | undefined) =>
  typeof o === 'string' ? o : (o?.value ?? '');

export function useBranchReorderTab(productId: string) {
  const { hasAnyRole, can, runtime, activeBranchId, canAccessBranch } =
    useAuth();
  const canRead =
    hasAnyRole(['Admin', 'Pharmacist', 'Cashier']) && can('inventory:read');
  const canWrite =
    hasAnyRole(['Admin', 'Pharmacist']) &&
    can('inventory:read') &&
    can('inventory:write') &&
    runtime === 'Cloud';
  const branchesQ = useAllBranchesQuery(
    { include_inactive: false },
    { enabled: canRead }
  );
  const loaded: readonly Branch[] = branchesQ.data ?? [];
  const options: readonly SelectOption[] = loaded
    .filter((b) => canAccessBranch(b.branch_id))
    .map((b) => ({
      value: b.branch_id,
      label: `${b.branch_code} — ${b.name}`,
    }));
  const [selectedId, setSelectedId] = useState('');
  const branchId = options.some((o) => optVal(o) === selectedId)
    ? selectedId
    : activeBranchId && options.some((o) => optVal(o) === activeBranchId)
      ? activeBranchId
      : optVal(options[0]);
  const ruleQ = useReorderRuleQuery(branchId, productId, { enabled: canRead });

  return {
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
  product: Product,
  rule: ReorderRule | null,
  canWrite: boolean
) {
  const upsertMut = useUpsertReorderRuleMutation();
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
    if (!canWrite || upsertMut.isPending || !isDirty) return;
    setSubmitError(null);
    try {
      const saved = await upsertMut.mutateAsync({
        branchId,
        productId: product.product_id,
        payload: toUpsertReorderRulePayload(values),
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
    isPending: upsertMut.isPending,
    isDirty,
    submitError,
    errors,
    isActive,
    register,
    setActive,
    onSubmit,
  };
}
