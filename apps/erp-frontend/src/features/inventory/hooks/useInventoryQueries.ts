import { useQuery } from '@tanstack/react-query';
import { fetchAllPages } from '../../../lib/api/pagination';
import {
  getInventorySummary,
  listInventoryBalances,
  listInventoryBatches,
  listInventoryLocations,
  listInventoryTransactions,
  type GetInventorySummaryParams,
  type ListInventoryBalancesParams,
  type ListInventoryBatchesParams,
  type ListInventoryLocationsParams,
  type ListInventoryTransactionsParams,
} from '../api/inventoryApi';
import {
  inventoryKeys,
  type AllInventoryBalancesKeyParams,
  type AllInventoryBatchesKeyParams,
  type AllInventoryLocationsKeyParams,
  type AllInventoryTransactionsKeyParams,
} from './inventoryKeys';

export interface UseInventoryQueryOptions {
  enabled?: boolean;
}

export type InventoryLocationsQueryParams = Omit<
  ListInventoryLocationsParams,
  'branch_id'
> & {
  branch_id?: string | null;
};

export type InventoryBatchesQueryParams = ListInventoryBatchesParams;

export type InventoryBalancesQueryParams = Omit<
  ListInventoryBalancesParams,
  'branch_id'
> & {
  branch_id?: string | null;
};

export interface InventorySummaryQueryParams {
  branch_id?: string | null;
  product_id?: string | null;
}

export type InventoryTransactionsQueryParams = Omit<
  ListInventoryTransactionsParams,
  'branch_id'
> & {
  branch_id?: string | null;
};

export type AllInventoryLocationsQueryParams = Omit<
  AllInventoryLocationsKeyParams,
  'branch_id'
> & {
  branch_id?: string | null;
};

export type AllInventoryBatchesQueryParams = AllInventoryBatchesKeyParams;

export type AllInventoryBalancesQueryParams = Omit<
  AllInventoryBalancesKeyParams,
  'branch_id'
> & {
  branch_id?: string | null;
};

export type AllInventoryTransactionsQueryParams = Omit<
  AllInventoryTransactionsKeyParams,
  'branch_id'
> & {
  branch_id?: string | null;
};

export function useInventoryLocationsQuery(
  params: InventoryLocationsQueryParams,
  options: UseInventoryQueryOptions = {}
) {
  const normalizedBranchId = params.branch_id?.trim() ?? '';
  const queryParams: ListInventoryLocationsParams = {
    ...params,
    branch_id: normalizedBranchId,
  };

  return useQuery({
    queryKey: inventoryKeys.locationList(queryParams),
    queryFn: () => {
      if (!normalizedBranchId) {
        return Promise.reject(new Error('Branch ID is required.'));
      }
      return listInventoryLocations(queryParams);
    },
    enabled: Boolean(normalizedBranchId) && (options.enabled ?? true),
  });
}

export function useInventoryBatchesQuery(
  params: InventoryBatchesQueryParams = {},
  options: UseInventoryQueryOptions = {}
) {
  return useQuery({
    queryKey: inventoryKeys.batchList(params),
    queryFn: () => listInventoryBatches(params),
    enabled: options.enabled ?? true,
  });
}

export function useInventoryBalancesQuery(
  params: InventoryBalancesQueryParams,
  options: UseInventoryQueryOptions = {}
) {
  const normalizedBranchId = params.branch_id?.trim() ?? '';
  const queryParams: ListInventoryBalancesParams = {
    ...params,
    branch_id: normalizedBranchId,
  };

  return useQuery({
    queryKey: inventoryKeys.balanceList(queryParams),
    queryFn: () => {
      if (!normalizedBranchId) {
        return Promise.reject(new Error('Branch ID is required.'));
      }
      return listInventoryBalances(queryParams);
    },
    enabled: Boolean(normalizedBranchId) && (options.enabled ?? true),
  });
}

export function useInventorySummaryQuery(
  params: InventorySummaryQueryParams,
  options: UseInventoryQueryOptions = {}
) {
  const normalizedBranchId = params.branch_id?.trim() ?? '';
  const normalizedProductId = params.product_id?.trim() ?? '';
  const queryParams: GetInventorySummaryParams = {
    branch_id: normalizedBranchId,
    product_id: normalizedProductId,
  };

  return useQuery({
    queryKey: inventoryKeys.summary(queryParams),
    queryFn: () => {
      if (!normalizedBranchId || !normalizedProductId) {
        return Promise.reject(
          new Error('Branch ID and Product ID are required.')
        );
      }
      return getInventorySummary(queryParams);
    },
    enabled:
      Boolean(normalizedBranchId) &&
      Boolean(normalizedProductId) &&
      (options.enabled ?? true),
  });
}

export function useInventoryTransactionsQuery(
  params: InventoryTransactionsQueryParams,
  options: UseInventoryQueryOptions = {}
) {
  const normalizedBranchId = params.branch_id?.trim() ?? '';
  const queryParams: ListInventoryTransactionsParams = {
    ...params,
    branch_id: normalizedBranchId,
  };

  return useQuery({
    queryKey: inventoryKeys.transactionList(queryParams),
    queryFn: () => {
      if (!normalizedBranchId) {
        return Promise.reject(new Error('Branch ID is required.'));
      }
      return listInventoryTransactions(queryParams);
    },
    enabled: Boolean(normalizedBranchId) && (options.enabled ?? true),
  });
}

export function useAllInventoryLocationsQuery(
  params: AllInventoryLocationsQueryParams,
  options: UseInventoryQueryOptions = {}
) {
  const normalizedBranchId = params.branch_id?.trim() ?? '';
  const keyParams: AllInventoryLocationsKeyParams = {
    ...params,
    branch_id: normalizedBranchId,
  };

  return useQuery({
    queryKey: inventoryKeys.allLocationList(keyParams),
    queryFn: () => {
      if (!normalizedBranchId) {
        return Promise.reject(new Error('Branch ID is required.'));
      }
      return fetchAllPages((page, pageSize) =>
        listInventoryLocations({ ...keyParams, page, page_size: pageSize })
      );
    },
    enabled: Boolean(normalizedBranchId) && (options.enabled ?? true),
  });
}

export function useAllInventoryBatchesQuery(
  params: AllInventoryBatchesQueryParams = {},
  options: UseInventoryQueryOptions = {}
) {
  return useQuery({
    queryKey: inventoryKeys.allBatchList(params),
    queryFn: () =>
      fetchAllPages((page, pageSize) =>
        listInventoryBatches({ ...params, page, page_size: pageSize })
      ),
    enabled: options.enabled ?? true,
  });
}

export function useAllInventoryBalancesQuery(
  params: AllInventoryBalancesQueryParams,
  options: UseInventoryQueryOptions = {}
) {
  const normalizedBranchId = params.branch_id?.trim() ?? '';
  const keyParams: AllInventoryBalancesKeyParams = {
    ...params,
    branch_id: normalizedBranchId,
  };

  return useQuery({
    queryKey: inventoryKeys.allBalanceList(keyParams),
    queryFn: () => {
      if (!normalizedBranchId) {
        return Promise.reject(new Error('Branch ID is required.'));
      }
      return fetchAllPages((page, pageSize) =>
        listInventoryBalances({ ...keyParams, page, page_size: pageSize })
      );
    },
    enabled: Boolean(normalizedBranchId) && (options.enabled ?? true),
  });
}

export function useAllInventoryTransactionsQuery(
  params: AllInventoryTransactionsQueryParams,
  options: UseInventoryQueryOptions = {}
) {
  const normalizedBranchId = params.branch_id?.trim() ?? '';
  const keyParams: AllInventoryTransactionsKeyParams = {
    ...params,
    branch_id: normalizedBranchId,
  };

  return useQuery({
    queryKey: inventoryKeys.allTransactionList(keyParams),
    queryFn: () => {
      if (!normalizedBranchId) {
        return Promise.reject(new Error('Branch ID is required.'));
      }
      return fetchAllPages((page, pageSize) =>
        listInventoryTransactions({ ...keyParams, page, page_size: pageSize })
      );
    },
    enabled: Boolean(normalizedBranchId) && (options.enabled ?? true),
  });
}
