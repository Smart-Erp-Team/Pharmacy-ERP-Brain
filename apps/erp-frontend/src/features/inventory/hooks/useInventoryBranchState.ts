import { useMemo, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'react-toastify';
import type { BadgeVariant } from '../../../components/ui/Badge';
import { useAuth } from '../../../hooks/useAuth';
import { ApiClientError } from '../../../lib/api/client';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../../lib/api/pagination';
import type {
  BatchQualityStatus,
  InventoryBatch,
  InventoryLocation,
  LocationType,
  RuntimeMode,
  StockBalance,
} from '../../../types/api';
import { useAllBranchesQuery, type Branch } from '../../branches';
import { useAllProductsQuery, type Product } from '../../products';
import {
  applyCreateLocationFormApiError,
  applyEditLocationFormApiError,
} from '../schemas/inventoryErrorMapper';
import {
  createEditLocationFormSchema,
  createLocationFormSchema,
  DEFAULT_LOCATION_FORM_VALUES,
  locationDtoToFormValues,
  toCreateLocationPayload,
  toLocationPatchPayload,
  type CreateLocationFormValues,
  type EditLocationFormValues,
} from '../schemas/inventoryLocationSchema';
import {
  useCreateInventoryLocationMutation,
  usePatchInventoryLocationMutation,
} from './useInventoryMutations';
import {
  useAllInventoryLocationsQuery,
  useInventoryBalancesQuery,
  useInventoryBatchesQuery,
  useInventoryLocationsQuery,
} from './useInventoryQueries';

export interface InventoryBranchOption {
  value: string;
  label: string;
}

export interface UseInventoryBranchStateResult {
  branches: readonly Branch[];
  branchOptions: readonly InventoryBranchOption[];
  branchId: string;
  branchName: string;
  isBranchesLoading: boolean;
  branchesError: string | null;
  onSelectBranch: (nextBranchId: string) => void;
  onRetryBranches: () => void;
  canReadBalances: boolean;
  canReadLedger: boolean;
  canWriteLocations: boolean;
  canWriteAdjustments: boolean;
  isAdmin: boolean;
  runtime: RuntimeMode | null;
}

export type LocationFilter = 'ALL' | LocationType;
export type SellableFilter = 'ALL' | 'SELLABLE' | 'NON_SELLABLE';
export type ExpiryFilter = 'ALL' | 'NEARING_EXPIRY' | 'EXPIRED' | 'NON_LOT';

export interface GroupedBalanceItem {
  balance: StockBalance;
  batch: InventoryBatch | undefined;
  location: InventoryLocation | undefined;
}

export const OVERVIEW_MAX_PAGE_SIZE = MAX_PAGE_SIZE;
export const STOCK_BALANCES_PAGE_SIZE = DEFAULT_PAGE_SIZE;
export const STORAGE_LOCATIONS_PAGE_SIZE = 20;

export const BALANCE_LOCATION_OPTIONS = [
  { value: 'ALL', label: 'All location types' },
  { value: 'SELLABLE', label: 'SELLABLE' },
  { value: 'QUARANTINE', label: 'QUARANTINE' },
  { value: 'DAMAGED', label: 'DAMAGED' },
  { value: 'SCRAP', label: 'SCRAP' },
] as const;

export const BALANCE_EXPIRY_OPTIONS = [
  { value: 'ALL', label: 'All expiry statuses' },
  { value: 'NEARING_EXPIRY', label: 'Nearing expiry' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'NON_LOT', label: 'NON-LOT' },
] as const;

export const LOCATION_SELLABLE_OPTIONS = [
  { value: 'ALL', label: 'All' },
  { value: 'SELLABLE', label: 'Sellable only' },
  { value: 'NON_SELLABLE', label: 'Non-sellable only' },
] as const;

export const LOCATION_TYPE_BADGE_VARIANT: Record<LocationType, BadgeVariant> = {
  SELLABLE: 'success',
  QUARANTINE: 'warning',
  DAMAGED: 'danger',
  SCRAP: 'danger',
};

export const BATCH_QUALITY_BADGE_VARIANT: Record<
  BatchQualityStatus,
  BadgeVariant
> = {
  AVAILABLE: 'success',
  QUARANTINED: 'warning',
  EXPIRED: 'danger',
  RECALLED: 'danger',
};

const LOCAL_BUSINESS_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function parseLocationFilter(value: string): LocationFilter {
  if (
    value === 'SELLABLE' ||
    value === 'QUARANTINE' ||
    value === 'DAMAGED' ||
    value === 'SCRAP'
  ) {
    return value;
  }
  return 'ALL';
}

export function parseExpiryFilter(value: string): ExpiryFilter {
  if (value === 'NEARING_EXPIRY' || value === 'EXPIRED' || value === 'NON_LOT')
    return value;
  return 'ALL';
}

export function parseSellableFilter(value: string): SellableFilter {
  if (value === 'SELLABLE' || value === 'NON_SELLABLE') return value;
  return 'ALL';
}

export function isNonLotBatchNumber(
  batchNumber: string | null | undefined
): boolean {
  return (batchNumber ?? '').trim().toUpperCase() === 'NON-LOT';
}

export function localDateOffset(days = 0): string {
  const now = new Date();
  return LOCAL_BUSINESS_DATE_FORMATTER.format(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + days)
  );
}

export function isBatchExpired(
  batch: Pick<InventoryBatch, 'batch_number' | 'expires_on' | 'quality_status'>,
  today = localDateOffset(0)
): boolean {
  if (batch.quality_status === 'EXPIRED') {
    return true;
  }
  return (
    !isNonLotBatchNumber(batch.batch_number) &&
    batch.expires_on !== null &&
    batch.expires_on <= today
  );
}

export function isBalanceExpired(
  balance: StockBalance,
  expiresOn: string | null,
  today = localDateOffset(0),
  isLocationActive = true
): boolean {
  if (balance.quality_status === 'EXPIRED') {
    return true;
  }
  const isNonLot = isNonLotBatchNumber(balance.batch_number);
  if (isNonLot || expiresOn === null) {
    return false;
  }
  if (expiresOn <= today) {
    return true;
  }
  return (
    balance.location_type === 'SELLABLE' &&
    balance.is_location_sellable &&
    isLocationActive &&
    balance.quality_status === 'AVAILABLE' &&
    balance.on_hand_qty_base > 0 &&
    balance.available_qty_base === 0
  );
}

export function sortBalancesFefo(
  items: readonly GroupedBalanceItem[]
): GroupedBalanceItem[] {
  return items.slice().sort((a, b) => {
    const expA = isNonLotBatchNumber(a.balance.batch_number)
      ? null
      : (a.balance.expires_on ?? a.batch?.expires_on ?? null);
    const expB = isNonLotBatchNumber(b.balance.batch_number)
      ? null
      : (b.balance.expires_on ?? b.batch?.expires_on ?? null);
    if (expA && expB) {
      const cmp = expA.localeCompare(expB);
      if (cmp !== 0) return cmp;
    } else if (expA) {
      return -1;
    } else if (expB) {
      return 1;
    }
    return a.balance.batch_id.localeCompare(b.balance.batch_id);
  });
}

export function useInventoryBranchState(): UseInventoryBranchStateResult {
  const {
    activeBranchId,
    branchScope,
    branchIds,
    runtime,
    hasRole,
    hasAnyRole,
    can,
    canAccessBranch,
    setActiveBranch,
  } = useAuth();

  const isAdmin = hasRole('Admin');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');

  const branchesQuery = useAllBranchesQuery({ include_inactive: false });

  const branches = useMemo<readonly Branch[]>(() => {
    return (branchesQuery.data ?? []).filter(
      (branch) => branch.is_active && canAccessBranch(branch.branch_id)
    );
  }, [branchesQuery.data, canAccessBranch]);

  const branchOptions = useMemo<readonly InventoryBranchOption[]>(() => {
    if (branches.length > 0) {
      return branches.map((branch) => ({
        value: branch.branch_id,
        label: `${branch.name} (${branch.branch_code})`,
      }));
    }

    const candidateIds: string[] = [];
    if (branchScope === 'ASSIGNED' || !isAdmin) {
      for (const id of branchIds) {
        const trimmed = id.trim();
        if (
          trimmed &&
          canAccessBranch(trimmed) &&
          !candidateIds.includes(trimmed)
        ) {
          candidateIds.push(trimmed);
        }
      }
    }

    if (
      activeBranchId &&
      canAccessBranch(activeBranchId) &&
      !candidateIds.includes(activeBranchId)
    ) {
      candidateIds.unshift(activeBranchId);
    }

    return candidateIds.map((id) => ({
      value: id,
      label: `Branch ${id.slice(0, 8)}`,
    }));
  }, [
    branches,
    branchScope,
    isAdmin,
    branchIds,
    activeBranchId,
    canAccessBranch,
  ]);

  const branchId = useMemo(() => {
    const allowedSet = new Set(branchOptions.map((option) => option.value));
    if (selectedBranchId && allowedSet.has(selectedBranchId)) {
      return selectedBranchId;
    }
    if (activeBranchId && allowedSet.has(activeBranchId)) {
      return activeBranchId;
    }
    return branchOptions[0]?.value ?? '';
  }, [branchOptions, selectedBranchId, activeBranchId]);

  const branchName = useMemo(() => {
    if (!branchId) return 'Unavailable';
    const matchedBranch = branches.find((item) => item.branch_id === branchId);
    if (matchedBranch) {
      return `${matchedBranch.name} (${matchedBranch.branch_code})`;
    }
    const matchedOption = branchOptions.find((item) => item.value === branchId);
    return matchedOption?.label ?? `Branch ${branchId.slice(0, 8)}`;
  }, [branchId, branches, branchOptions]);

  const onSelectBranch = (nextBranchId: string) => {
    const trimmed = nextBranchId.trim();
    if (!trimmed || !canAccessBranch(trimmed)) return;
    setSelectedBranchId(trimmed);
    setActiveBranch(trimmed);
  };

  const onRetryBranches = () => {
    void branchesQuery.refetch();
  };

  const branchesError = branchesQuery.isError
    ? branchesQuery.error instanceof Error
      ? branchesQuery.error.message
      : 'Unable to load branches.'
    : null;

  return {
    branches,
    branchOptions,
    branchId,
    branchName,
    isBranchesLoading: branchesQuery.isLoading,
    branchesError,
    onSelectBranch,
    onRetryBranches,
    canReadBalances: can('inventory:read'),
    canReadLedger: hasAnyRole(['Admin', 'Pharmacist']) && can('inventory:read'),
    canWriteLocations:
      hasAnyRole(['Admin', 'Pharmacist']) && can('inventory:write'),
    canWriteAdjustments:
      hasAnyRole(['Admin', 'Pharmacist']) &&
      can('inventory:write') &&
      runtime === 'BranchLocal',
    isAdmin,
    runtime,
  };
}

export function useStockOverviewData(branchId: string) {
  const balancesQuery = useInventoryBalancesQuery({
    branch_id: branchId,
    page: 1,
    page_size: OVERVIEW_MAX_PAGE_SIZE,
  });
  const batchesQuery = useInventoryBatchesQuery({
    page: 1,
    page_size: OVERVIEW_MAX_PAGE_SIZE,
  });
  const locationsQuery = useAllInventoryLocationsQuery({
    branch_id: branchId,
    include_inactive: false,
  });
  const productsQuery = useAllProductsQuery({ include_inactive: true });

  const balances = useMemo(
    () => balancesQuery.data?.items ?? [],
    [balancesQuery.data?.items]
  );
  const batches = useMemo(
    () => batchesQuery.data?.items ?? [],
    [batchesQuery.data?.items]
  );
  const locations = useMemo(
    () => locationsQuery.data ?? [],
    [locationsQuery.data]
  );

  const totalBalanceCount = balancesQuery.data?.total_count ?? null;
  const totalBatchCount = batchesQuery.data?.total_count ?? null;
  const isTruncatedSummary =
    (totalBalanceCount !== null &&
      totalBalanceCount > OVERVIEW_MAX_PAGE_SIZE) ||
    (totalBatchCount !== null && totalBatchCount > OVERVIEW_MAX_PAGE_SIZE);
  const truncationNotice =
    totalBalanceCount !== null && totalBalanceCount > OVERVIEW_MAX_PAGE_SIZE
      ? `Showing overview metrics from the first ${OVERVIEW_MAX_PAGE_SIZE} of ${totalBalanceCount} balance records.`
      : totalBatchCount !== null && totalBatchCount > OVERVIEW_MAX_PAGE_SIZE
        ? `Showing overview metrics from the first ${OVERVIEW_MAX_PAGE_SIZE} of ${totalBatchCount} batch records.`
        : null;

  const flaggedRows = useMemo(() => {
    const today = localDateOffset(0);
    const batchMap = new Map(batches.map((b) => [b.batch_id, b]));
    const locationMap = new Map(locations.map((l) => [l.location_id, l]));
    const productMap = new Map<string, Product>(
      (productsQuery.data ?? []).map((p) => [p.product_id, p])
    );

    return balances
      .map((balance) => {
        const batch = batchMap.get(balance.batch_id);
        const location = locationMap.get(balance.location_id);
        const product = productMap.get(balance.product_id);
        const alertDays = product?.expiry_alert_days ?? 0;
        const isNonLot = isNonLotBatchNumber(balance.batch_number);
        const exp = isNonLot
          ? null
          : (balance.expires_on ?? batch?.expires_on ?? null);
        const expired = isBalanceExpired(
          balance,
          exp,
          today,
          location?.is_active ?? true
        );
        const held =
          balance.quality_status === 'QUARANTINED' ||
          balance.quality_status === 'RECALLED';
        const nearing = Boolean(
          !expired && exp && alertDays > 0 && exp <= localDateOffset(alertDays)
        );
        const reason = expired
          ? 'Expired'
          : held
            ? balance.quality_status
            : nearing
              ? 'Expiring soon'
              : null;
        return { balance, batch, product, reason };
      })
      .filter((item) => item.reason !== null);
  }, [balances, batches, locations, productsQuery.data]);

  const retry = () => {
    if (balancesQuery.isError) void balancesQuery.refetch();
    if (batchesQuery.isError) void batchesQuery.refetch();
    if (locationsQuery.isError) void locationsQuery.refetch();
    if (productsQuery.isError) void productsQuery.refetch();
  };

  return {
    balances,
    batches,
    locations,
    flaggedRows,
    totalBalanceCount,
    totalBatchCount,
    isTruncatedSummary,
    truncationNotice,
    isBalancesLoading: balancesQuery.isLoading,
    isBalancesError: balancesQuery.isError,
    isBatchesLoading: batchesQuery.isLoading,
    isBatchesError: batchesQuery.isError,
    isLocationsLoading: locationsQuery.isLoading,
    isLocationsError: locationsQuery.isError,
    isPreviewLoading:
      balancesQuery.isLoading ||
      batchesQuery.isLoading ||
      locationsQuery.isLoading ||
      productsQuery.isLoading,
    hasPreviewError:
      balancesQuery.isError ||
      batchesQuery.isError ||
      locationsQuery.isError ||
      productsQuery.isError,
    retry,
  };
}

export function useStockBalancesState(branchId: string) {
  const [search, setSearch] = useState('');
  const [locationType, setLocationTypeState] = useState<LocationFilter>('ALL');
  const [locationId, setLocationId] = useState('');
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('ALL');
  const [paging, setPaging] = useState<{ scope: string; page: number }>({
    scope: '',
    page: 1,
  });
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const scopeKey = `${branchId}|${locationId}|${locationType}|${expiryFilter}|${search.trim().toLowerCase()}`;
  const page = paging.scope === scopeKey ? paging.page : 1;

  const balancesQ = useInventoryBalancesQuery({
    branch_id: branchId,
    location_id: locationId || undefined,
    page,
    page_size: STOCK_BALANCES_PAGE_SIZE,
  });
  const locationsQ = useAllInventoryLocationsQuery({
    branch_id: branchId,
    include_inactive: true,
  });
  const productsQ = useAllProductsQuery({ include_inactive: true });

  const locationOptions = useMemo(() => {
    const matching = (locationsQ.data ?? []).filter(
      (loc) => locationType === 'ALL' || loc.location_type === locationType
    );
    return [
      { value: '', label: 'All storage locations' },
      ...matching.map((loc) => ({
        value: loc.location_id,
        label: `${loc.name} (${loc.location_code})`,
      })),
    ];
  }, [locationsQ.data, locationType]);

  const setLocationType = (nextType: LocationFilter) => {
    setLocationTypeState(nextType);
    if (nextType !== 'ALL' && locationId) {
      const selectedLoc = (locationsQ.data ?? []).find(
        (loc) => loc.location_id === locationId
      );
      if (selectedLoc && selectedLoc.location_type !== nextType) {
        setLocationId('');
      }
    }
  };

  const pageItems = useMemo(
    () => balancesQ.data?.items ?? [],
    [balancesQ.data?.items]
  );

  const groupedProducts = useMemo(() => {
    const today = localDateOffset(0);
    const q = search.trim().toLowerCase();
    const locMap = new Map(
      (locationsQ.data ?? []).map((l) => [l.location_id, l])
    );
    const prodMap = new Map<string, Product>(
      (productsQ.data ?? []).map((p) => [p.product_id, p])
    );
    const groups = new Map<
      string,
      { product: Product | undefined; items: GroupedBalanceItem[] }
    >();

    for (const balance of pageItems) {
      const location = locMap.get(balance.location_id);
      const product = prodMap.get(balance.product_id);
      if (locationType !== 'ALL' && balance.location_type !== locationType) {
        continue;
      }

      const isNonLot = isNonLotBatchNumber(balance.batch_number);
      const exp = isNonLot ? null : (balance.expires_on ?? null);
      const expired = isBalanceExpired(
        balance,
        exp,
        today,
        location?.is_active ?? true
      );
      const alertDays = product?.expiry_alert_days ?? 0;
      const nearing = Boolean(
        !expired && exp && alertDays > 0 && exp <= localDateOffset(alertDays)
      );

      if (expiryFilter === 'NON_LOT' && !isNonLot) continue;
      if (expiryFilter === 'EXPIRED' && !expired) continue;
      if (expiryFilter === 'NEARING_EXPIRY' && !nearing) continue;
      if (
        q &&
        ![
          balance.product_name,
          balance.product_sku,
          product?.name,
          product?.sku,
          product?.barcode,
          balance.batch_number,
          balance.location_code,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      ) {
        continue;
      }

      const entry = groups.get(balance.product_id) ?? { product, items: [] };
      entry.items.push({ balance, batch: undefined, location });
      groups.set(balance.product_id, entry);
    }

    return Array.from(groups.entries()).sort(([, a], [, b]) => {
      const nameA = a.product?.name ?? a.items[0]?.balance.product_name ?? '';
      const nameB = b.product?.name ?? b.items[0]?.balance.product_name ?? '';
      return nameA.localeCompare(nameB);
    });
  }, [
    pageItems,
    locationsQ.data,
    productsQ.data,
    locationType,
    expiryFilter,
    search,
  ]);

  const totalCount = balancesQ.data?.total_count ?? null;
  const hasNextPage = balancesQ.data
    ? balancesQ.data.next_cursor !== null ||
      balancesQ.data.page * balancesQ.data.page_size <
        balancesQ.data.total_count
    : false;

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1) return;
    if (nextPage > page && !hasNextPage) return;
    setPaging({ scope: scopeKey, page: nextPage });
  };

  const toggleExpand = (productId: string) => {
    setExpandedIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const clearFilters = () => {
    setSearch('');
    setLocationTypeState('ALL');
    setLocationId('');
    setExpiryFilter('ALL');
    setPaging({ scope: '', page: 1 });
  };

  const retry = () => {
    if (balancesQ.isError) void balancesQ.refetch();
    if (locationsQ.isError) void locationsQ.refetch();
    if (productsQ.isError) void productsQ.refetch();
  };

  return {
    search,
    setSearch,
    locationType,
    setLocationType,
    locationId,
    setLocationId,
    locationOptions,
    expiryFilter,
    setExpiryFilter,
    page,
    totalCount,
    hasNextPage,
    pageItemCount: pageItems.length,
    isMultiPage: totalCount !== null && totalCount > pageItems.length,
    showPagination:
      groupedProducts.length > 0 ||
      page > 1 ||
      (totalCount !== null && totalCount > STOCK_BALANCES_PAGE_SIZE),
    paginationProps: {
      page,
      pageSize: STOCK_BALANCES_PAGE_SIZE,
      itemCount: totalCount,
      hasNextPage,
      onPageChange: handlePageChange,
    },
    expandedIds,
    toggleExpand,
    groupedProducts,
    hasFilters:
      search.trim().length > 0 ||
      locationType !== 'ALL' ||
      locationId !== '' ||
      expiryFilter !== 'ALL',
    isLoading:
      balancesQ.isLoading || locationsQ.isLoading || productsQ.isLoading,
    isError: balancesQ.isError || locationsQ.isError || productsQ.isError,
    clearFilters,
    handlePageChange,
    retry,
  };
}

export function useStorageLocationsState(branchId: string) {
  const { hasAnyRole, can } = useAuth();
  const canWrite =
    hasAnyRole(['Admin', 'Pharmacist']) && can('inventory:write');

  const [sellableFilter, setSellableFilter] = useState<SellableFilter>('ALL');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [paging, setPaging] = useState<{ scope: string; page: number }>({
    scope: '',
    page: 1,
  });
  const [modal, setModal] = useState<{
    open: boolean;
    location: InventoryLocation | null;
  }>({ open: false, location: null });
  const [togglingIds, setTogglingIds] = useState<string[]>([]);
  const togglingRef = useRef<Set<string>>(new Set());

  const scopeKey = `${branchId}|${sellableFilter}|${String(includeInactive)}`;
  const page = paging.scope === scopeKey ? paging.page : 1;

  const locationsQ = useInventoryLocationsQuery({
    branch_id: branchId,
    is_sellable:
      sellableFilter === 'ALL' ? undefined : sellableFilter === 'SELLABLE',
    include_inactive: includeInactive,
    page,
    page_size: STORAGE_LOCATIONS_PAGE_SIZE,
  });
  const patchMutation = usePatchInventoryLocationMutation();

  const totalCount = locationsQ.data?.total_count ?? null;
  const hasNextPage = locationsQ.data
    ? locationsQ.data.page * locationsQ.data.page_size <
      locationsQ.data.total_count
    : false;

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1) return;
    if (nextPage > page && !hasNextPage) return;
    setPaging({ scope: scopeKey, page: nextPage });
  };

  const handleToggleActive = async (
    location: InventoryLocation,
    nextActive: boolean
  ) => {
    if (!canWrite || togglingRef.current.has(location.location_id)) return;
    togglingRef.current.add(location.location_id);
    setTogglingIds((prev) =>
      prev.includes(location.location_id)
        ? prev
        : [...prev, location.location_id]
    );
    try {
      await patchMutation.mutateAsync({
        locationId: location.location_id,
        payload: { is_active: nextActive },
      });
      toast.success(
        `${location.name} marked ${nextActive ? 'active' : 'inactive'}`
      );
    } catch (error: unknown) {
      const msg =
        error instanceof ApiClientError
          ? error.trace_id
            ? `${error.message} (Trace: ${error.trace_id})`
            : error.message
          : 'Unable to update location status.';
      toast.error(msg);
    } finally {
      togglingRef.current.delete(location.location_id);
      setTogglingIds((prev) =>
        prev.filter((id) => id !== location.location_id)
      );
    }
  };

  return {
    canWrite,
    sellableFilter,
    setSellableFilter,
    includeInactive,
    setIncludeInactive,
    page,
    totalCount,
    hasNextPage,
    locations: locationsQ.data?.items ?? [],
    isLoading: locationsQ.isLoading,
    isError: locationsQ.isError,
    retry: () => void locationsQ.refetch(),
    modal,
    openCreateModal: () => setModal({ open: true, location: null }),
    openEditModal: (location: InventoryLocation) =>
      setModal({ open: true, location }),
    closeModal: () => setModal({ open: false, location: null }),
    togglingIds,
    handlePageChange,
    handleToggleActive,
  };
}

export interface UseLocationModalFormOptions {
  branchId: string;
  location: InventoryLocation | null;
  onClose: () => void;
}

const DEFAULT_EDIT_LOCATION_VALUES: EditLocationFormValues = {
  name: '',
  is_sellable: true,
  is_active: true,
};

export function useLocationModalForm({
  branchId,
  location,
  onClose,
}: UseLocationModalFormOptions) {
  const isEdit = location !== null;
  const createMutation = useCreateInventoryLocationMutation();
  const patchMutation = usePatchInventoryLocationMutation();
  const isPending = createMutation.isPending || patchMutation.isPending;
  const [submitError, setSubmitError] = useState<string | null>(null);

  const editSchema = useMemo(
    () => createEditLocationFormSchema(location?.location_type ?? 'SELLABLE'),
    [location?.location_type]
  );

  const createForm = useForm<CreateLocationFormValues>({
    resolver: zodResolver(createLocationFormSchema),
    mode: 'onTouched',
    defaultValues: DEFAULT_LOCATION_FORM_VALUES,
  });

  const editForm = useForm<EditLocationFormValues>({
    resolver: zodResolver(editSchema),
    mode: 'onTouched',
    defaultValues: location
      ? locationDtoToFormValues(location)
      : DEFAULT_EDIT_LOCATION_VALUES,
  });

  const watchedCreateType = useWatch({
    control: createForm.control,
    name: 'location_type',
  });
  const watchedCreateSellable = useWatch({
    control: createForm.control,
    name: 'is_sellable',
  });
  const watchedEditSellable = useWatch({
    control: editForm.control,
    name: 'is_sellable',
  });
  const watchedEditActive = useWatch({
    control: editForm.control,
    name: 'is_active',
  });

  const handleClose = () => {
    if (!isPending) onClose();
  };

  const handleCreateSubmit = createForm.handleSubmit(async (values) => {
    if (isPending) return;
    setSubmitError(null);
    try {
      await createMutation.mutateAsync({
        payload: toCreateLocationPayload(values, branchId),
      });
      toast.success(`Location "${values.name.trim()}" created`);
      createForm.reset(DEFAULT_LOCATION_FORM_VALUES);
      onClose();
    } catch (error: unknown) {
      const formError = applyCreateLocationFormApiError(
        error,
        createForm.setError
      );
      if (formError) {
        setSubmitError(formError);
        toast.error(formError);
      }
    }
  });

  const handleEditSubmit = editForm.handleSubmit(async (values) => {
    if (!location || isPending || !editForm.formState.isDirty) return;
    setSubmitError(null);
    try {
      await patchMutation.mutateAsync({
        locationId: location.location_id,
        payload: toLocationPatchPayload(values),
      });
      toast.success(`Location "${values.name.trim()}" updated`);
      onClose();
    } catch (error: unknown) {
      const formError = applyEditLocationFormApiError(error, editForm.setError);
      if (formError) {
        setSubmitError(formError);
        toast.error(formError);
      }
    }
  });

  return {
    isEdit,
    isPending,
    isDirty: isEdit ? editForm.formState.isDirty : createForm.formState.isDirty,
    submitError,
    locationType: isEdit ? location.location_type : watchedCreateType,
    isSellable: isEdit ? watchedEditSellable : watchedCreateSellable,
    isActive: watchedEditActive,
    createRegister: createForm.register,
    editRegister: editForm.register,
    onCreateLocationTypeChange: (nextType: string) => {
      createForm.setValue('is_sellable', nextType === 'SELLABLE', {
        shouldValidate: true,
        shouldDirty: true,
      });
    },
    onIsSellableChange: (checked: boolean) => {
      if (isEdit) {
        editForm.setValue('is_sellable', checked, {
          shouldDirty: true,
          shouldValidate: true,
        });
      } else {
        createForm.setValue('is_sellable', checked, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    },
    onIsActiveChange: (checked: boolean) => {
      editForm.setValue('is_active', checked, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    errors: isEdit
      ? {
          name: editForm.formState.errors.name?.message,
          is_sellable: editForm.formState.errors.is_sellable?.message,
          is_active: editForm.formState.errors.is_active?.message,
        }
      : {
          location_code: createForm.formState.errors.location_code?.message,
          name: createForm.formState.errors.name?.message,
          location_type: createForm.formState.errors.location_type?.message,
          is_sellable: createForm.formState.errors.is_sellable?.message,
        },
    handleClose,
    handleFormSubmit: isEdit ? handleEditSubmit : handleCreateSubmit,
  };
}
