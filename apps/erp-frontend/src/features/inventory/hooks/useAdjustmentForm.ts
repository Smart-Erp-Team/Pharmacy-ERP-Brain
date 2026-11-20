import { useEffect, useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  useFieldArray,
  useForm,
  useFormState,
  useWatch,
  type FieldErrors,
} from 'react-hook-form';
import { toast } from 'react-toastify';
import type { SelectOption } from '../../../components/ui/Select';
import {
  useProductsQuery,
  type ProductDto,
  type ProductUomDto,
} from '../../../features/products';
import { useAuth } from '../../../hooks/useAuth';
import type {
  AdjustmentsTxnType,
  InventoryBatchDto,
  InventoryLocationDto,
  InventoryTxnDto,
} from '../../../types/api';
import {
  ADJUSTMENT_TXN_TYPES,
  createEmptyAdjustmentLine,
  DEFAULT_ADJUSTMENT_FORM_VALUES,
  inventoryAdjustmentFormSchema,
  inventoryTxnDtoToPatchFormValues,
  toInventoryTxnPatchPayload,
  toInventoryTxnPayload,
  type InventoryAdjustmentFormValues,
  type InventoryAdjustmentLineFormValues,
} from '../schemas/inventoryAdjustmentSchema';
import { applyAdjustmentFormApiError } from '../schemas/inventoryErrorMapper';
import { formatInventoryApiError } from './useLedgerHistoryState';
import {
  useCancelInventoryAdjustmentMutation,
  usePatchInventoryAdjustmentMutation,
  usePostInventoryAdjustmentByIdMutation,
  usePostInventoryAdjustmentMutation,
} from './useInventoryMutations';
import {
  useInventoryBatchesQuery,
  useInventoryLocationsQuery,
  useInventoryTransactionsQuery,
} from './useInventoryQueries';

export function getLineSelectOptions(
  products: readonly ProductDto[],
  locations: readonly InventoryLocationDto[],
  batches: readonly InventoryBatchDto[],
  uoms: readonly ProductUomDto[],
  selectedProductId: string,
  selectedLocationId: string,
  selectedBatchId: string,
  selectedUomId: string,
  isNonLotProduct: boolean
) {
  return {
    productOptions: buildLineProductOptions(products, selectedProductId),
    locationOptions: buildLineLocationOptions(locations, selectedLocationId),
    batchOptions: buildLineBatchOptions(
      batches,
      selectedProductId,
      selectedBatchId,
      isNonLotProduct
    ),
    uomOptions: buildLineUomOptions(uoms, selectedProductId, selectedUomId),
  };
}

export function buildAdjustmentLineSelectConfigs(params: {
  index: number;
  disabled: boolean;
  products: readonly ProductDto[];
  locations: readonly InventoryLocationDto[];
  batches: readonly InventoryBatchDto[];
  uoms: readonly ProductUomDto[];
  productId: string;
  locationId: string;
  batchId: string;
  uomId: string;
  isNonLot: boolean;
  lineErrors?: FieldErrors<InventoryAdjustmentLineFormValues>;
  onProductChange: (index: number, productId: string) => void;
}) {
  const {
    index,
    disabled,
    products,
    locations,
    batches,
    uoms,
    productId,
    locationId,
    batchId,
    uomId,
    isNonLot,
    lineErrors,
    onProductChange,
  } = params;
  const opts = getLineSelectOptions(
    products,
    locations,
    batches,
    uoms,
    productId,
    locationId,
    batchId,
    uomId,
    isNonLot
  );
  const batchHint = isNonLot
    ? batchId
      ? 'Locked to NON-LOT (lot tracking not required).'
      : 'No NON-LOT batch found for this product.'
    : undefined;

  return [
    {
      name: `lines.${index}.product_id` as const,
      label: 'Product',
      options: opts.productOptions,
      isDisabled: disabled,
      hint: undefined,
      error: lineErrors?.product_id?.message,
      onValueChange: (value: string) => onProductChange(index, value),
    },
    {
      name: `lines.${index}.location_id` as const,
      label: 'Location',
      options: opts.locationOptions,
      isDisabled: disabled,
      hint: undefined,
      error: lineErrors?.location_id?.message,
      onValueChange: undefined,
    },
    {
      name: `lines.${index}.batch_id` as const,
      label: 'Batch',
      options: opts.batchOptions,
      isDisabled: disabled || !productId || isNonLot,
      hint: batchHint,
      error: lineErrors?.batch_id?.message,
      onValueChange: undefined,
    },
    {
      name: `lines.${index}.product_uom_id` as const,
      label: 'Unit of measure',
      options: opts.uomOptions,
      isDisabled: disabled || !productId,
      hint: undefined,
      error: lineErrors?.product_uom_id?.message,
      onValueChange: undefined,
    },
  ];
}

export interface UseAdjustmentFormOptions {
  branchId: string;
  initialReversalTxn?: InventoryTxnDto | null;
  onClearReversal?: () => void;
}

export interface ActiveDraftAction {
  txnId: string;
  type: 'post' | 'cancel';
}

const VALID_ADJUSTMENT_TYPES: ReadonlySet<string> = new Set(
  ADJUSTMENT_TXN_TYPES
);

export function isAdjustmentTxnType(
  value: string
): value is AdjustmentsTxnType {
  return VALID_ADJUSTMENT_TYPES.has(value);
}

function buildReversalFormValues(
  targetTxn: InventoryTxnDto,
  reasonCode = '',
  note = ''
): InventoryAdjustmentFormValues {
  return {
    transaction_type: 'REVERSAL',
    reason_code: reasonCode,
    note,
    reverses_inventory_txn_id: targetTxn.inventory_txn_id,
    lines:
      targetTxn.lines.length > 0
        ? targetTxn.lines.map((line) => ({
            product_id: line.product_id,
            location_id: line.location_id,
            batch_id: line.batch_id,
            product_uom_id: line.product_uom_id,
            entered_qty: line.entered_qty,
            unit_cost_base: '',
          }))
        : [createEmptyAdjustmentLine()],
  };
}

export function buildLineProductOptions(
  products: readonly ProductDto[],
  selectedId: string
): SelectOption[] {
  const options: SelectOption[] = [
    { value: '', label: 'Select product...' },
    ...products.map((p) => ({
      value: p.product_id,
      label: `${p.name} (${p.sku})`,
    })),
  ];
  if (selectedId && !products.some((p) => p.product_id === selectedId)) {
    options.push({
      value: selectedId,
      label: `Product ${selectedId.slice(0, 8)}`,
    });
  }
  return options;
}

export function buildLineLocationOptions(
  locations: readonly InventoryLocationDto[],
  selectedId: string
): SelectOption[] {
  const options: SelectOption[] = [
    { value: '', label: 'Select location...' },
    ...locations.map((loc) => ({
      value: loc.location_id,
      label: `${loc.name} (${loc.location_code} · ${loc.location_type})`,
    })),
  ];
  if (selectedId && !locations.some((loc) => loc.location_id === selectedId)) {
    options.push({
      value: selectedId,
      label: `Location ${selectedId.slice(0, 8)}`,
    });
  }
  return options;
}

export function buildLineBatchOptions(
  batches: readonly InventoryBatchDto[],
  selectedProductId: string,
  selectedBatchId: string,
  isNonLotProduct: boolean
): SelectOption[] {
  const productBatches = batches.filter(
    (b) => b.product_id === selectedProductId
  );
  const nonLotBatch = productBatches.find(
    (b) => b.is_non_lot || b.batch_number === 'NON-LOT'
  );
  if (isNonLotProduct) {
    if (nonLotBatch) {
      return [
        {
          value: nonLotBatch.batch_id,
          label: 'NON-LOT (System non-lot batch)',
        },
      ];
    }
    return [{ value: '', label: 'NON-LOT unavailable' }];
  }
  const options: SelectOption[] = [
    {
      value: '',
      label: selectedProductId ? 'Select batch...' : 'Select product first',
    },
    ...productBatches.map((b) => ({
      value: b.batch_id,
      label: b.expires_on
        ? `${b.batch_number} · exp ${b.expires_on} (${b.quality_status})`
        : `${b.batch_number} (${b.quality_status})`,
    })),
  ];
  if (
    selectedBatchId &&
    !productBatches.some((b) => b.batch_id === selectedBatchId)
  ) {
    options.push({
      value: selectedBatchId,
      label: `Batch ${selectedBatchId.slice(0, 8)}`,
    });
  }
  return options;
}

export function buildLineUomOptions(
  uoms: readonly ProductUomDto[],
  selectedProductId: string,
  selectedUomId: string
): SelectOption[] {
  const visible = uoms.filter(
    (u) => u.is_active || u.product_uom_id === selectedUomId
  );
  const options: SelectOption[] = [
    {
      value: '',
      label: selectedProductId ? 'Select UOM...' : 'Select product first',
    },
    ...visible.map((u) => ({
      value: u.product_uom_id,
      label: u.is_base
        ? `${u.display_name} (${u.uom_code}, base)`
        : `${u.display_name} (${u.uom_code})`,
    })),
  ];
  if (
    selectedUomId &&
    !visible.some((u) => u.product_uom_id === selectedUomId)
  ) {
    options.push({
      value: selectedUomId,
      label: `UOM ${selectedUomId.slice(0, 8)}`,
    });
  }
  return options;
}

export function useAdjustmentForm({
  branchId,
  initialReversalTxn = null,
  onClearReversal,
}: UseAdjustmentFormOptions) {
  const { hasAnyRole, can, runtime } = useAuth();
  const canAccessTab =
    hasAnyRole(['Admin', 'Pharmacist']) && can('inventory:read');
  const canWriteAdjustments =
    hasAnyRole(['Admin', 'Pharmacist']) &&
    can('inventory:write') &&
    runtime === 'BranchLocal';

  const productsQuery = useProductsQuery(
    { includeInactive: false, limit: 200 },
    { enabled: canAccessTab }
  );
  const locationsQuery = useInventoryLocationsQuery(
    { branchId, includeInactive: false, limit: 200 },
    { enabled: canAccessTab }
  );
  const batchesQuery = useInventoryBatchesQuery(
    { branchId, limit: 200 },
    { enabled: canAccessTab }
  );
  const transactionsQuery = useInventoryTransactionsQuery(
    { branchId, limit: 200 },
    { enabled: canAccessTab }
  );

  const postMutation = usePostInventoryAdjustmentMutation();
  const patchMutation = usePatchInventoryAdjustmentMutation();
  const postByIdMutation = usePostInventoryAdjustmentByIdMutation();
  const cancelMutation = useCancelInventoryAdjustmentMutation();

  const [prevBranchId, setPrevBranchId] = useState(branchId);
  const [prevReversalId, setPrevReversalId] = useState<string | null>(
    initialReversalTxn?.inventory_txn_id ?? null
  );
  const [editingDraftTxn, setEditingDraftTxn] =
    useState<InventoryTxnDto | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [draftActionError, setDraftActionError] = useState<string | null>(null);
  const [activeDraftAction, setActiveDraftAction] =
    useState<ActiveDraftAction | null>(null);

  const incomingReversalId =
    initialReversalTxn && initialReversalTxn.branch_id === branchId
      ? initialReversalTxn.inventory_txn_id
      : null;

  if (branchId !== prevBranchId) {
    setPrevBranchId(branchId);
    setEditingDraftTxn(null);
    setSubmitError(null);
    setDraftActionError(null);
  }
  if (incomingReversalId !== prevReversalId) {
    setPrevReversalId(incomingReversalId);
    if (incomingReversalId) {
      setEditingDraftTxn(null);
      setSubmitError(null);
    }
  }

  const initialDefaults =
    initialReversalTxn && initialReversalTxn.branch_id === branchId
      ? buildReversalFormValues(initialReversalTxn)
      : DEFAULT_ADJUSTMENT_FORM_VALUES;

  const {
    control,
    handleSubmit,
    setError,
    clearErrors,
    setValue,
    getValues,
    reset,
  } = useForm<InventoryAdjustmentFormValues>({
    resolver: zodResolver(inventoryAdjustmentFormSchema),
    defaultValues: initialDefaults,
    mode: 'onTouched',
  });

  const { errors, isDirty } = useFormState({ control });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'lines',
  });

  const appliedBranchRef = useRef(branchId);
  const appliedReversalIdRef = useRef<string | null>(incomingReversalId);

  useEffect(() => {
    if (appliedBranchRef.current !== branchId) {
      appliedBranchRef.current = branchId;
      appliedReversalIdRef.current = null;
      reset(DEFAULT_ADJUSTMENT_FORM_VALUES);
    }
    if (
      incomingReversalId &&
      appliedReversalIdRef.current !== incomingReversalId &&
      initialReversalTxn
    ) {
      appliedReversalIdRef.current = incomingReversalId;
      reset(buildReversalFormValues(initialReversalTxn));
    } else if (!incomingReversalId) {
      appliedReversalIdRef.current = null;
    }
  }, [branchId, incomingReversalId, initialReversalTxn, reset]);

  const watchedTxnType = useWatch({ control, name: 'transaction_type' });
  const transactionType: AdjustmentsTxnType = watchedTxnType ?? 'ADJUSTMENT_IN';
  const reversesTxnId =
    useWatch({ control, name: 'reverses_inventory_txn_id' }) ?? '';

  const products = useMemo(
    () => productsQuery.data?.items ?? [],
    [productsQuery.data?.items]
  );
  const locations = useMemo(
    () => locationsQuery.data?.items ?? [],
    [locationsQuery.data?.items]
  );
  const batches = useMemo(
    () => batchesQuery.data?.items ?? [],
    [batchesQuery.data?.items]
  );
  const transactions = useMemo(
    () => transactionsQuery.data?.items ?? [],
    [transactionsQuery.data?.items]
  );

  const draftTransactions = useMemo(
    () => transactions.filter((txn) => txn.status === 'DRAFT'),
    [transactions]
  );
  const reversibleTransactions = useMemo(
    () => transactions.filter((txn) => txn.status === 'POSTED'),
    [transactions]
  );

  const isSubmittingForm = postMutation.isPending || patchMutation.isPending;
  const isMutatingDraft =
    postByIdMutation.isPending || cancelMutation.isPending;
  const isFormDisabled =
    !canWriteAdjustments || isSubmittingForm || !branchId.trim();

  const handleTransactionTypeChange = (nextType: AdjustmentsTxnType) => {
    if (isFormDisabled || editingDraftTxn) {
      return;
    }
    setValue('transaction_type', nextType, {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (nextType !== 'REVERSAL') {
      setValue('reverses_inventory_txn_id', '', { shouldDirty: true });
      clearErrors('reverses_inventory_txn_id');
      onClearReversal?.();
    }
    if (nextType === 'ADJUSTMENT_OUT' || nextType === 'REVERSAL') {
      const currentLines = getValues('lines');
      for (let i = 0; i < currentLines.length; i += 1) {
        setValue(`lines.${i}.unit_cost_base`, '', { shouldDirty: true });
        clearErrors(`lines.${i}.unit_cost_base`);
      }
    }
  };

  const handleReversalTargetChange = (nextTxnId: string) => {
    if (isFormDisabled || editingDraftTxn) {
      return;
    }
    setValue('reverses_inventory_txn_id', nextTxnId, {
      shouldDirty: true,
      shouldValidate: true,
    });
    clearErrors('reverses_inventory_txn_id');
    if (!nextTxnId) {
      onClearReversal?.();
      return;
    }
    const targetTxn = reversibleTransactions.find(
      (txn) => txn.inventory_txn_id === nextTxnId
    );
    if (targetTxn) {
      const nextValues = buildReversalFormValues(
        targetTxn,
        getValues('reason_code'),
        getValues('note')
      );
      replace(nextValues.lines);
    }
  };

  const handleLineProductChange = (index: number, nextProductId: string) => {
    if (isFormDisabled) {
      return;
    }
    setValue(`lines.${index}.product_id`, nextProductId, {
      shouldDirty: true,
      shouldValidate: true,
    });
    clearErrors(`lines.${index}.product_id`);

    const product = products.find((p) => p.product_id === nextProductId);
    if (!product) {
      setValue(`lines.${index}.batch_id`, '', { shouldDirty: true });
      setValue(`lines.${index}.product_uom_id`, '', { shouldDirty: true });
      return;
    }

    const baseUom =
      product.uoms.find((u) => u.is_base) ?? product.uoms[0] ?? null;
    setValue(`lines.${index}.product_uom_id`, baseUom?.product_uom_id ?? '', {
      shouldDirty: true,
      shouldValidate: Boolean(baseUom),
    });
    if (baseUom) {
      clearErrors(`lines.${index}.product_uom_id`);
    }

    if (product.lot_tracking_required === false) {
      const nonLotBatch = batches.find(
        (b) =>
          b.product_id === nextProductId &&
          (b.is_non_lot || b.batch_number === 'NON-LOT')
      );
      setValue(`lines.${index}.batch_id`, nonLotBatch?.batch_id ?? '', {
        shouldDirty: true,
        shouldValidate: Boolean(nonLotBatch),
      });
      if (nonLotBatch) {
        clearErrors(`lines.${index}.batch_id`);
      }
    } else {
      setValue(`lines.${index}.batch_id`, '', { shouldDirty: true });
    }
  };

  const handleAddLine = () => {
    if (isFormDisabled) {
      return;
    }
    append(createEmptyAdjustmentLine());
  };

  const handleRemoveLine = (index: number) => {
    if (isFormDisabled || fields.length <= 1) {
      return;
    }
    remove(index);
  };

  const handleEditDraft = (txn: InventoryTxnDto) => {
    if (!canWriteAdjustments || txn.status !== 'DRAFT' || isMutatingDraft) {
      return;
    }
    onClearReversal?.();
    setSubmitError(null);
    setDraftActionError(null);
    setEditingDraftTxn(txn);
    reset(inventoryTxnDtoToPatchFormValues(txn));
  };

  const handleCancelEditDraft = () => {
    setEditingDraftTxn(null);
    setSubmitError(null);
    reset(DEFAULT_ADJUSTMENT_FORM_VALUES);
  };

  const handlePostDraft = async (txn: InventoryTxnDto) => {
    if (
      !canWriteAdjustments ||
      txn.status !== 'DRAFT' ||
      isMutatingDraft ||
      isSubmittingForm
    ) {
      return;
    }
    setDraftActionError(null);
    setActiveDraftAction({ txnId: txn.inventory_txn_id, type: 'post' });
    try {
      const posted = await postByIdMutation.mutateAsync({
        txnId: txn.inventory_txn_id,
      });
      if (editingDraftTxn?.inventory_txn_id === txn.inventory_txn_id) {
        setEditingDraftTxn(null);
        reset(DEFAULT_ADJUSTMENT_FORM_VALUES);
      }
      toast.success(`Adjustment ${posted.transaction_no} posted`);
    } catch (error) {
      const msg = formatInventoryApiError(
        error,
        'Unable to post draft adjustment.'
      );
      setDraftActionError(msg);
      toast.error(msg);
    } finally {
      setActiveDraftAction(null);
    }
  };

  const handleCancelDraft = async (txn: InventoryTxnDto) => {
    if (
      !canWriteAdjustments ||
      txn.status !== 'DRAFT' ||
      isMutatingDraft ||
      isSubmittingForm
    ) {
      return;
    }
    setDraftActionError(null);
    setActiveDraftAction({ txnId: txn.inventory_txn_id, type: 'cancel' });
    try {
      await cancelMutation.mutateAsync({ txnId: txn.inventory_txn_id });
      if (editingDraftTxn?.inventory_txn_id === txn.inventory_txn_id) {
        setEditingDraftTxn(null);
        reset(DEFAULT_ADJUSTMENT_FORM_VALUES);
      }
      toast.success(`Draft ${txn.transaction_no} cancelled`);
    } catch (error) {
      const msg = formatInventoryApiError(
        error,
        'Unable to cancel draft adjustment.'
      );
      setDraftActionError(msg);
      toast.error(msg);
    } finally {
      setActiveDraftAction(null);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    if (isFormDisabled || (editingDraftTxn && !isDirty)) {
      return;
    }
    setSubmitError(null);
    try {
      if (editingDraftTxn) {
        const updated = await patchMutation.mutateAsync({
          txnId: editingDraftTxn.inventory_txn_id,
          payload: toInventoryTxnPatchPayload(values),
        });
        setEditingDraftTxn(null);
        reset(DEFAULT_ADJUSTMENT_FORM_VALUES);
        toast.success(`Draft ${updated.transaction_no} updated`);
      } else {
        const created = await postMutation.mutateAsync({
          payload: toInventoryTxnPayload(values, branchId),
        });
        setEditingDraftTxn(null);
        reset(DEFAULT_ADJUSTMENT_FORM_VALUES);
        onClearReversal?.();
        toast.success(
          `Adjustment ${created.transaction_no} posted (${created.transaction_type})`
        );
      }
    } catch (error) {
      const bannerMessage = applyAdjustmentFormApiError(error, setError);
      if (bannerMessage) {
        setSubmitError(bannerMessage);
        toast.error(bannerMessage);
      }
    }
  });

  const isLoadingLookups =
    productsQuery.isLoading ||
    locationsQuery.isLoading ||
    batchesQuery.isLoading;
  const lookupsError =
    productsQuery.error ?? locationsQuery.error ?? batchesQuery.error ?? null;
  const hasLookupsError =
    productsQuery.isError || locationsQuery.isError || batchesQuery.isError;

  const retryLookups = () => {
    if (productsQuery.isError) void productsQuery.refetch();
    if (locationsQuery.isError) void locationsQuery.refetch();
    if (batchesQuery.isError) void batchesQuery.refetch();
    if (transactionsQuery.isError) void transactionsQuery.refetch();
  };

  const draftsErrorMessage = transactionsQuery.isError
    ? formatInventoryApiError(
        transactionsQuery.error,
        'Unable to load draft adjustments.'
      )
    : undefined;
  const lookupsErrorMessage = hasLookupsError
    ? formatInventoryApiError(
        lookupsError,
        'Unable to load products, locations, or batches.'
      )
    : undefined;

  const draftListProps = {
    drafts: draftTransactions,
    isLoading: transactionsQuery.isLoading,
    isError: transactionsQuery.isError,
    errorMessage: draftsErrorMessage,
    isRetrying: transactionsQuery.isFetching,
    canWriteAdjustments,
    editingTxnId: editingDraftTxn?.inventory_txn_id ?? null,
    activeAction: activeDraftAction,
    isBusy: isMutatingDraft || isSubmittingForm,
    actionError: draftActionError,
    onRetry: () => {
      void transactionsQuery.refetch();
    },
    onEditDraft: handleEditDraft,
    onPostDraft: (txn: InventoryTxnDto) => {
      void handlePostDraft(txn);
    },
    onCancelDraft: (txn: InventoryTxnDto) => {
      void handleCancelDraft(txn);
    },
  };

  const headerProps = {
    transactionType,
    reversesTxnId,
    isEditingDraft: editingDraftTxn !== null,
    disabled: isFormDisabled,
    reversibleTransactions,
    control,
    errors,
    onTransactionTypeChange: handleTransactionTypeChange,
    onReversalTargetChange: handleReversalTargetChange,
  };

  return {
    canAccessTab,
    canWriteAdjustments,
    runtime,
    products,
    locations,
    batches,
    draftTransactions,
    reversibleTransactions,
    transactionsQuery,
    isLoadingLookups,
    hasLookupsError,
    lookupsError,
    lookupsErrorMessage,
    draftsErrorMessage,
    draftListProps,
    headerProps,
    retryLookups,
    control,
    errors,
    isDirty,
    fields,
    transactionType,
    reversesTxnId,
    editingDraftTxn,
    submitError,
    draftActionError,
    activeDraftAction,
    isSubmittingForm,
    isMutatingDraft,
    isFormDisabled,
    handleTransactionTypeChange,
    handleReversalTargetChange,
    handleLineProductChange,
    handleAddLine,
    handleRemoveLine,
    handleEditDraft,
    handleCancelEditDraft,
    handlePostDraft,
    handleCancelDraft,
    onSubmit,
  };
}
