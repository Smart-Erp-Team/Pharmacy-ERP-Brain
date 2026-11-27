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
  useAllProductsQuery,
  type Product,
  type ProductUom,
} from '../../../features/products';
import { useAuth } from '../../../hooks/useAuth';
import { isAdjustmentsTxnType } from '../../../lib/api/catalogInventoryNormalizers';
import type {
  AdjustmentsTxnType,
  InventoryLocation,
  InventoryTxn,
} from '../../../types/api';
import {
  createEmptyAdjustmentLine,
  createInventoryAdjustmentFormSchema,
  DEFAULT_ADJUSTMENT_FORM_VALUES,
  toCreateInventoryAdjustmentPayload,
  type InventoryAdjustmentFormValues,
  type InventoryAdjustmentLineFormValues,
} from '../schemas/inventoryAdjustmentSchema';
import { applyAdjustmentFormApiError } from '../schemas/inventoryErrorMapper';
import { useCreateInventoryAdjustmentMutation } from './useInventoryMutations';
import {
  useAllInventoryLocationsQuery,
  useAllInventoryTransactionsQuery,
} from './useInventoryQueries';
import { formatInventoryApiError } from './useLedgerHistoryState';

export interface UseAdjustmentFormOptions {
  branchId: string;
  initialReversalTxn?: InventoryTxn | null;
  onClearReversal?: () => void;
}

export function isAdjustmentTxnType(
  value: string
): value is AdjustmentsTxnType {
  return isAdjustmentsTxnType(value);
}

export function buildLineProductOptions(
  products: readonly Product[],
  selectedId: string
): SelectOption[] {
  const options: SelectOption[] = [
    { value: '', label: 'Select product...' },
    ...products.map((product) => ({
      value: product.product_id,
      label: `${product.name} (${product.sku})`,
    })),
  ];
  if (selectedId && !products.some((item) => item.product_id === selectedId)) {
    options.push({
      value: selectedId,
      label: `Product ${selectedId.slice(0, 8)}`,
    });
  }
  return options;
}

export function buildLineLocationOptions(
  locations: readonly InventoryLocation[],
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

export function buildLineUomOptions(
  uoms: readonly ProductUom[],
  selectedProductId: string,
  selectedUomId: string
): SelectOption[] {
  const activeUoms = uoms.filter(
    (uom) => uom.is_active || uom.product_uom_id === selectedUomId
  );
  const options: SelectOption[] = [
    {
      value: '',
      label: selectedProductId ? 'Select UOM...' : 'Select product first',
    },
    ...activeUoms.map((uom) => ({
      value: uom.product_uom_id,
      label: uom.is_base
        ? `${uom.display_name} (${uom.uom_code}, base)`
        : `${uom.display_name} (${uom.uom_code})`,
    })),
  ];
  if (
    selectedUomId &&
    !activeUoms.some((uom) => uom.product_uom_id === selectedUomId)
  ) {
    options.push({
      value: selectedUomId,
      label: `UOM ${selectedUomId.slice(0, 8)}`,
    });
  }
  return options;
}

export function buildAdjustmentLineFieldConfigs(params: {
  index: number;
  transactionType: AdjustmentsTxnType;
  disabled: boolean;
  products: readonly Product[];
  locations: readonly InventoryLocation[];
  productId: string;
  uomId: string;
  locationId: string;
  lineErrors?: FieldErrors<InventoryAdjustmentLineFormValues>;
  onProductChange: (index: number, productId: string) => void;
}) {
  const {
    index,
    transactionType,
    disabled,
    products,
    locations,
    productId,
    uomId,
    locationId,
    lineErrors,
    onProductChange,
  } = params;

  const selectedProduct = products.find((p) => p.product_id === productId);
  const isNonLot = selectedProduct?.lot_tracking_required === false;
  const isLotTracked = selectedProduct?.lot_tracking_required === true;
  const uoms = selectedProduct?.uoms ?? [];
  const showUnitCost =
    transactionType === 'OPENING_BALANCE' ||
    transactionType === 'ADJUSTMENT_IN';

  const selectFields = [
    {
      name: `lines.${index}.product_id` as const,
      label: 'Product',
      options: buildLineProductOptions(products, productId),
      isDisabled: disabled,
      hint: undefined,
      error: lineErrors?.product_id?.message,
      onValueChange: (value: string) => onProductChange(index, value),
    },
    {
      name: `lines.${index}.product_uom_id` as const,
      label: 'Unit of measure',
      options: buildLineUomOptions(uoms, productId, uomId),
      isDisabled: disabled || !productId,
      hint: undefined,
      error: lineErrors?.product_uom_id?.message,
      onValueChange: undefined,
    },
    {
      name: `lines.${index}.location_id` as const,
      label: 'Location',
      options: buildLineLocationOptions(locations, locationId),
      isDisabled: disabled,
      hint: undefined,
      error: lineErrors?.location_id?.message,
      onValueChange: undefined,
    },
  ];

  const baseInputs = [
    {
      name: `lines.${index}.batch_number` as const,
      label: 'Batch number',
      type: 'text' as const,
      inputMode: undefined,
      maxLength: 80,
      placeholder: isNonLot ? 'NON-LOT' : 'e.g. MEDCARE-LOT-2601',
      isRequired: isLotTracked,
      isDisabled: disabled || isNonLot,
      hint: isNonLot
        ? 'Non-lot product (automatic NON-LOT batch)'
        : isLotTracked
          ? 'Required for lot-tracked product (cannot be NON-LOT)'
          : undefined,
      error: lineErrors?.batch_number?.message,
    },
    {
      name: `lines.${index}.manufactured_on` as const,
      label: 'Manufactured date',
      type: 'date' as const,
      inputMode: undefined,
      maxLength: undefined,
      placeholder: undefined,
      isRequired: false,
      isDisabled: disabled || isNonLot,
      hint: undefined,
      error: lineErrors?.manufactured_on?.message,
    },
    {
      name: `lines.${index}.expires_on` as const,
      label: 'Expiry date',
      type: 'date' as const,
      inputMode: undefined,
      maxLength: undefined,
      placeholder: undefined,
      isRequired: isLotTracked,
      isDisabled: disabled || isNonLot,
      hint: isLotTracked ? 'Required for lot-tracked product' : undefined,
      error: lineErrors?.expires_on?.message,
    },
    {
      name: `lines.${index}.entered_qty` as const,
      label: 'Quantity',
      type: 'text' as const,
      inputMode: 'decimal' as const,
      maxLength: undefined,
      placeholder: 'e.g. 10',
      isRequired: true,
      isDisabled: disabled,
      hint: selectedProduct
        ? `Entered in selected UOM (base: ${selectedProduct.base_uom_code})`
        : undefined,
      error: lineErrors?.entered_qty?.message,
    },
  ];

  const inputFields = showUnitCost
    ? [
        ...baseInputs,
        {
          name: `lines.${index}.unit_cost_entered` as const,
          label: 'Unit cost',
          type: 'text' as const,
          inputMode: 'decimal' as const,
          maxLength: undefined,
          placeholder: '0.00',
          isRequired: true,
          isDisabled: disabled,
          hint: 'Required non-negative cost per entered UOM',
          error: lineErrors?.unit_cost_entered?.message,
        },
      ]
    : baseInputs;

  return { selectFields, inputFields };
}

function buildReversalFormValues(
  targetTxn: InventoryTxn
): InventoryAdjustmentFormValues {
  return {
    transaction_type: 'REVERSAL',
    reason_code: '',
    note: '',
    reverses_inventory_txn_id: targetTxn.inventory_txn_id,
    lines: [createEmptyAdjustmentLine()],
  };
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
    runtime === 'BranchLocal' &&
    hasAnyRole(['Admin', 'Pharmacist']) &&
    can('inventory:write');

  const productsQuery = useAllProductsQuery(
    { include_inactive: false },
    { enabled: canAccessTab }
  );
  const locationsQuery = useAllInventoryLocationsQuery(
    { branch_id: branchId, include_inactive: false },
    { enabled: canAccessTab }
  );
  const transactionsQuery = useAllInventoryTransactionsQuery(
    { branch_id: branchId },
    { enabled: canAccessTab }
  );

  const createMutation = useCreateInventoryAdjustmentMutation();

  const [prevBranchId, setPrevBranchId] = useState(branchId);
  const [prevReversalId, setPrevReversalId] = useState<string | null>(
    initialReversalTxn?.inventory_txn_id ?? null
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  const incomingReversalId =
    initialReversalTxn && initialReversalTxn.branch_id === branchId
      ? initialReversalTxn.inventory_txn_id
      : null;

  if (branchId !== prevBranchId) {
    setPrevBranchId(branchId);
    setSubmitError(null);
  }
  if (incomingReversalId !== prevReversalId) {
    setPrevReversalId(incomingReversalId);
    if (incomingReversalId) {
      setSubmitError(null);
    }
  }

  const products = useMemo(
    () => productsQuery.data ?? [],
    [productsQuery.data]
  );
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.product_id, product])),
    [products]
  );
  const adjustmentSchema = useMemo(
    () => createInventoryAdjustmentFormSchema(productsById),
    [productsById]
  );

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
    resolver: zodResolver(adjustmentSchema),
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

  const locations = useMemo(
    () => locationsQuery.data ?? [],
    [locationsQuery.data]
  );
  const reversibleTransactions = useMemo(
    () =>
      (transactionsQuery.data ?? []).filter(
        (txn) => txn.status === 'POSTED' && txn.transaction_type !== 'REVERSAL'
      ),
    [transactionsQuery.data]
  );

  const isSubmittingForm = createMutation.isPending;
  const isFormDisabled =
    !canWriteAdjustments || isSubmittingForm || !branchId.trim();

  const handleTransactionTypeChange = (nextType: AdjustmentsTxnType) => {
    if (isFormDisabled) {
      return;
    }
    setSubmitError(null);
    setValue('transaction_type', nextType, {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (nextType !== 'REVERSAL') {
      setValue('reverses_inventory_txn_id', '', { shouldDirty: true });
      clearErrors('reverses_inventory_txn_id');
      onClearReversal?.();
      if (getValues('lines').length === 0) {
        replace([createEmptyAdjustmentLine()]);
      }
    }
    if (nextType === 'ADJUSTMENT_OUT' || nextType === 'REVERSAL') {
      const currentLines = getValues('lines');
      for (let index = 0; index < currentLines.length; index += 1) {
        setValue(`lines.${index}.unit_cost_entered`, '', { shouldDirty: true });
        clearErrors(`lines.${index}.unit_cost_entered`);
      }
    }
  };

  const handleReversalTargetChange = (nextTxnId: string) => {
    if (isFormDisabled) {
      return;
    }
    setSubmitError(null);
    setValue('reverses_inventory_txn_id', nextTxnId, {
      shouldDirty: true,
      shouldValidate: true,
    });
    clearErrors('reverses_inventory_txn_id');
    if (!nextTxnId) {
      onClearReversal?.();
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
      setValue(`lines.${index}.product_uom_id`, '', { shouldDirty: true });
      return;
    }

    const activeUoms = product.uoms.filter((uom) => uom.is_active);
    const defaultUom =
      activeUoms.find((uom) => uom.is_base) ?? activeUoms[0] ?? null;

    setValue(
      `lines.${index}.product_uom_id`,
      defaultUom?.product_uom_id ?? '',
      {
        shouldDirty: true,
        shouldValidate: Boolean(defaultUom),
      }
    );
    if (defaultUom) {
      clearErrors(`lines.${index}.product_uom_id`);
    }

    clearErrors([
      `lines.${index}.batch_number`,
      `lines.${index}.manufactured_on`,
      `lines.${index}.expires_on`,
    ]);

    if (!product.lot_tracking_required) {
      setValue(`lines.${index}.batch_number`, '', { shouldDirty: true });
      setValue(`lines.${index}.manufactured_on`, '', { shouldDirty: true });
      setValue(`lines.${index}.expires_on`, '', { shouldDirty: true });
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

  const onSubmit = handleSubmit(async (values) => {
    if (isFormDisabled) {
      return;
    }
    setSubmitError(null);
    try {
      const created = await createMutation.mutateAsync({
        payload: toCreateInventoryAdjustmentPayload(values, branchId),
      });
      reset(DEFAULT_ADJUSTMENT_FORM_VALUES);
      onClearReversal?.();
      toast.success(
        `Adjustment ${created.transaction_no} posted (${created.transaction_type})`
      );
    } catch (error: unknown) {
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
    (transactionType === 'REVERSAL' && transactionsQuery.isLoading);
  const lookupsError =
    productsQuery.error ??
    locationsQuery.error ??
    (transactionType === 'REVERSAL' ? transactionsQuery.error : null) ??
    null;
  const hasLookupsError =
    productsQuery.isError ||
    locationsQuery.isError ||
    (transactionType === 'REVERSAL' && transactionsQuery.isError);

  const retryLookups = () => {
    if (productsQuery.isError) void productsQuery.refetch();
    if (locationsQuery.isError) void locationsQuery.refetch();
    if (transactionsQuery.isError) void transactionsQuery.refetch();
  };

  const lookupsErrorMessage = hasLookupsError
    ? formatInventoryApiError(
        lookupsError,
        'Unable to load products, locations, or posted transactions.'
      )
    : undefined;

  const headerProps = {
    transactionType,
    reversesTxnId,
    disabled: isFormDisabled,
    reversibleTransactions,
    control,
    errors,
    onTransactionTypeChange: handleTransactionTypeChange,
    onReversalTargetChange: handleReversalTargetChange,
  };

  const linesError =
    errors.lines?.root?.message ??
    (typeof errors.lines?.message === 'string'
      ? errors.lines.message
      : undefined);

  const readOnlyNotice =
    runtime !== 'BranchLocal'
      ? {
          title: 'BranchLocal runtime required',
          body: 'Stock adjustments and opening balances must be posted on the BranchLocal runtime.',
        }
      : !canWriteAdjustments
        ? {
            title: 'Read-only access',
            body: 'Posting stock adjustments requires the inventory:write permission.',
          }
        : null;

  const lineRowBaseProps = {
    totalLines: fields.length,
    transactionType,
    disabled: isFormDisabled,
    products,
    locations,
    control,
    onProductChange: handleLineProductChange,
    onRemove: handleRemoveLine,
  };

  return {
    canAccessTab,
    canWriteAdjustments,
    runtime,
    products,
    locations,
    reversibleTransactions,
    isLoadingLookups,
    hasLookupsError,
    lookupsErrorMessage,
    linesError,
    readOnlyNotice,
    headerProps,
    lineRowBaseProps,
    retryLookups,
    control,
    errors,
    isDirty,
    fields,
    transactionType,
    reversesTxnId,
    submitError,
    isSubmittingForm,
    isFormDisabled,
    handleTransactionTypeChange,
    handleReversalTargetChange,
    handleLineProductChange,
    handleAddLine,
    handleRemoveLine,
    onSubmit,
  };
}
