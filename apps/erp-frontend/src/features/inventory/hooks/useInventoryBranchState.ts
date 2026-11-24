import { useMemo, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../../../hooks/useAuth';
import { ApiClientError } from '../../../lib/api/client';
import type {
  BranchDto,
  InventoryBalanceDto,
  InventoryBatchDto,
  InventoryLocationDto,
  LocationType,
  RuntimeMode,
} from '../../../types/api';
import { useAllBranchesQuery } from '../../branches';
import { useAllProductsQuery, type ProductDto } from '../../products';
import { usePatchInventoryLocationMutation } from './useInventoryMutations';
import {
  useAllInventoryBalancesQuery,
  useAllInventoryBatchesQuery,
  useAllInventoryLocationsQuery,
  useInventoryLocationsQuery,
} from './useInventoryQueries';

export interface InventoryBranchOption {
  value: string;
  label: string;
}

export interface UseInventoryBranchStateResult {
  branches: readonly BranchDto[];
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
export type ExpiryFilter = 'ALL' | 'NEARING_EXPIRY' | 'EXPIRED' | 'NON_LOT';

export interface GroupedBalanceItem {
  balance: InventoryBalanceDto;
  batch: InventoryBatchDto | undefined;
  location: InventoryLocationDto | undefined;
}

export const STORAGE_LOCATIONS_PAGE_SIZE = 20;

function utcDateOffset(days = 0): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)
  )
    .toISOString()
    .slice(0, 10);
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

  const branchesQuery = useAllBranchesQuery(
    { includeInactive: false },
    { enabled: isAdmin }
  );

  const branches = useMemo<readonly BranchDto[]>(() => {
    if (!isAdmin) return [];
    return (branchesQuery.data ?? []).filter(
      (branch) => branch.is_active && canAccessBranch(branch.branch_id)
    );
  }, [isAdmin, branchesQuery.data, canAccessBranch]);

  const branchOptions = useMemo<readonly InventoryBranchOption[]>(() => {
    if (isAdmin && branches.length > 0) {
      return branches.map((branch) => ({
        value: branch.branch_id,
        label: `${branch.name} (${branch.code})`,
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
    isAdmin,
    branches,
    branchScope,
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
    if (matchedBranch) return `${matchedBranch.name} (${matchedBranch.code})`;
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
    if (isAdmin) void branchesQuery.refetch();
  };

  const branchesError =
    isAdmin && branchesQuery.isError
      ? branchesQuery.error instanceof Error
        ? branchesQuery.error.message
        : 'Unable to load branches.'
      : null;

  return {
    branches,
    branchOptions,
    branchId,
    branchName,
    isBranchesLoading: isAdmin && branchesQuery.isLoading,
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
  const balancesQuery = useAllInventoryBalancesQuery({ branchId });
  const batchesQuery = useAllInventoryBatchesQuery({ branchId });
  const locationsQuery = useAllInventoryLocationsQuery({
    branchId,
    includeInactive: false,
  });
  const productsQuery = useAllProductsQuery({ includeInactive: true });

  const balances = useMemo(
    () => balancesQuery.data ?? [],
    [balancesQuery.data]
  );
  const batches = useMemo(() => batchesQuery.data ?? [], [batchesQuery.data]);
  const locations = useMemo(
    () => locationsQuery.data ?? [],
    [locationsQuery.data]
  );

  const flaggedRows = useMemo(() => {
    const today = utcDateOffset(0);
    const batchMap = new Map(batches.map((b) => [b.batch_id, b]));
    const productMap = new Map<string, ProductDto>(
      (productsQuery.data ?? []).map((p) => [p.product_id, p])
    );

    return balances
      .map((balance) => {
        const batch = batchMap.get(balance.batch_id);
        const product = productMap.get(balance.product_id);
        const alertDays = product?.expiry_alert_days ?? 0;
        const exp = batch?.is_non_lot ? null : (batch?.expires_on ?? null);
        const expired = Boolean(
          batch?.quality_status === 'EXPIRED' || (exp && exp < today)
        );
        const held =
          batch?.quality_status === 'QUARANTINED' ||
          batch?.quality_status === 'RECALLED';
        const nearing = Boolean(
          !expired && exp && alertDays > 0 && exp <= utcDateOffset(alertDays)
        );
        const reason = expired
          ? 'Expired'
          : held && batch
            ? batch.quality_status
            : nearing
              ? 'Expiring soon'
              : null;
        return { balance, batch, product, reason };
      })
      .filter((item) => item.reason !== null);
  }, [balances, batches, productsQuery.data]);

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
    isBalancesLoading: balancesQuery.isLoading,
    isBalancesError: balancesQuery.isError,
    isBatchesLoading: batchesQuery.isLoading,
    isBatchesError: batchesQuery.isError,
    isLocationsLoading: locationsQuery.isLoading,
    isLocationsError: locationsQuery.isError,
    isPreviewLoading:
      balancesQuery.isLoading ||
      batchesQuery.isLoading ||
      productsQuery.isLoading,
    hasPreviewError:
      balancesQuery.isError || batchesQuery.isError || productsQuery.isError,
    retry,
  };
}

export function useStockBalancesState(branchId: string) {
  const [search, setSearch] = useState('');
  const [locationType, setLocationType] = useState<LocationFilter>('ALL');
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>('ALL');
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  const balancesQ = useAllInventoryBalancesQuery({ branchId });
  const batchesQ = useAllInventoryBatchesQuery({ branchId });
  const locationsQ = useAllInventoryLocationsQuery({
    branchId,
    includeInactive: true,
  });
  const productsQ = useAllProductsQuery({ includeInactive: true });

  const groupedProducts = useMemo(() => {
    const today = utcDateOffset(0);
    const q = search.trim().toLowerCase();
    const batchMap = new Map((batchesQ.data ?? []).map((b) => [b.batch_id, b]));
    const locMap = new Map(
      (locationsQ.data ?? []).map((l) => [l.location_id, l])
    );
    const prodMap = new Map<string, ProductDto>(
      (productsQ.data ?? []).map((p) => [p.product_id, p])
    );
    const groups = new Map<
      string,
      { product: ProductDto | undefined; items: GroupedBalanceItem[] }
    >();

    for (const balance of balancesQ.data ?? []) {
      const batch = batchMap.get(balance.batch_id);
      const location = locMap.get(balance.location_id);
      const product = prodMap.get(balance.product_id);
      if (locationType !== 'ALL' && location?.location_type !== locationType) {
        continue;
      }

      const isNonLot = Boolean(batch?.is_non_lot);
      const exp = isNonLot ? null : (batch?.expires_on ?? null);
      const expired = Boolean(
        batch?.quality_status === 'EXPIRED' || (exp && exp < today)
      );
      const alertDays = product?.expiry_alert_days ?? 0;
      const nearing = Boolean(
        !expired && exp && alertDays > 0 && exp <= utcDateOffset(alertDays)
      );

      if (expiryFilter === 'NON_LOT' && !isNonLot) continue;
      if (expiryFilter === 'EXPIRED' && !expired) continue;
      if (expiryFilter === 'NEARING_EXPIRY' && !nearing) continue;
      if (
        q &&
        ![product?.name, product?.sku, product?.barcode]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      ) {
        continue;
      }

      const entry = groups.get(balance.product_id) ?? { product, items: [] };
      entry.items.push({ balance, batch, location });
      groups.set(balance.product_id, entry);
    }

    return Array.from(groups.entries()).sort(([, a], [, b]) =>
      (a.product?.name ?? '').localeCompare(b.product?.name ?? '')
    );
  }, [
    balancesQ.data,
    batchesQ.data,
    locationsQ.data,
    productsQ.data,
    locationType,
    expiryFilter,
    search,
  ]);

  const toggleExpand = (productId: string) => {
    setExpandedIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const clearFilters = () => {
    setSearch('');
    setLocationType('ALL');
    setExpiryFilter('ALL');
  };

  const retry = () => {
    if (balancesQ.isError) void balancesQ.refetch();
    if (batchesQ.isError) void batchesQ.refetch();
    if (locationsQ.isError) void locationsQ.refetch();
    if (productsQ.isError) void productsQ.refetch();
  };

  return {
    search,
    setSearch,
    locationType,
    setLocationType,
    expiryFilter,
    setExpiryFilter,
    expandedIds,
    toggleExpand,
    groupedProducts,
    hasFilters:
      search.trim().length > 0 ||
      locationType !== 'ALL' ||
      expiryFilter !== 'ALL',
    isLoading:
      balancesQ.isLoading ||
      batchesQ.isLoading ||
      locationsQ.isLoading ||
      productsQ.isLoading,
    isError:
      balancesQ.isError ||
      batchesQ.isError ||
      locationsQ.isError ||
      productsQ.isError,
    clearFilters,
    retry,
  };
}

export function useStorageLocationsState(branchId: string) {
  const { hasAnyRole, can } = useAuth();
  const canWrite =
    hasAnyRole(['Admin', 'Pharmacist']) && can('inventory:write');

  const [locationType, setLocationType] = useState<LocationFilter>('ALL');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [paging, setPaging] = useState<{
    scope: string;
    stack: (string | undefined)[];
    index: number;
  }>({ scope: '', stack: [undefined], index: 0 });
  const [modal, setModal] = useState<{
    open: boolean;
    location: InventoryLocationDto | null;
  }>({ open: false, location: null });
  const [togglingIds, setTogglingIds] = useState<string[]>([]);
  const togglingRef = useRef<Set<string>>(new Set());

  const scopeKey = `${branchId}|${locationType}|${String(includeInactive)}`;
  const pageIndex = paging.scope === scopeKey ? paging.index : 0;
  const stack = paging.scope === scopeKey ? paging.stack : [undefined];

  const locationsQ = useInventoryLocationsQuery({
    branchId,
    cursor: stack[pageIndex],
    limit: STORAGE_LOCATIONS_PAGE_SIZE,
    locationType: locationType === 'ALL' ? undefined : locationType,
    includeInactive,
  });
  const patchMutation = usePatchInventoryLocationMutation();

  const handlePageChange = (nextPage: number) => {
    const nextIndex = nextPage - 1;
    if (nextIndex < 0) return;
    if (nextIndex < pageIndex && nextIndex < stack.length) {
      setPaging({ scope: scopeKey, stack, index: nextIndex });
      return;
    }
    const nextCursor = locationsQ.data?.nextCursor;
    if (nextIndex === pageIndex + 1 && nextCursor) {
      setPaging({
        scope: scopeKey,
        stack: [...stack.slice(0, nextIndex), nextCursor],
        index: nextIndex,
      });
    }
  };

  const handleToggleActive = async (
    location: InventoryLocationDto,
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
    } catch (error) {
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
    locationType,
    setLocationType,
    includeInactive,
    setIncludeInactive,
    page: pageIndex + 1,
    hasNextPage: Boolean(locationsQ.data?.nextCursor),
    locations: locationsQ.data?.items ?? [],
    isLoading: locationsQ.isLoading,
    isError: locationsQ.isError,
    retry: () => void locationsQ.refetch(),
    modal,
    openCreateModal: () => setModal({ open: true, location: null }),
    openEditModal: (location: InventoryLocationDto) =>
      setModal({ open: true, location }),
    closeModal: () => setModal({ open: false, location: null }),
    togglingIds,
    handlePageChange,
    handleToggleActive,
  };
}
