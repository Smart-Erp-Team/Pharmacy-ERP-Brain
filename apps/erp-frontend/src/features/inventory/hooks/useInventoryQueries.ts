import { useQuery } from '@tanstack/react-query';
import {
  getInventoryLocation,
  getInventoryTransaction,
  listInventoryBalances,
  listInventoryBatches,
  listInventoryLocations,
  listInventoryTransactions,
  type ListInventoryBalancesParams,
  type ListInventoryBatchesParams,
  type ListInventoryLocationsParams,
  type ListInventoryTransactionsParams,
} from '../api/inventoryApi';
import { inventoryKeys } from './inventoryKeys';

export interface UseInventoryQueryOptions {
  enabled?: boolean;
}

export type InventoryLocationsQueryParams = Omit<
  ListInventoryLocationsParams,
  'branchId'
> & {
  branchId?: string | null;
};

export type InventoryBatchesQueryParams = Omit<
  ListInventoryBatchesParams,
  'branchId'
> & {
  branchId?: string | null;
};

export type InventoryBalancesQueryParams = Omit<
  ListInventoryBalancesParams,
  'branchId'
> & {
  branchId?: string | null;
};

export type InventoryTransactionsQueryParams = Omit<
  ListInventoryTransactionsParams,
  'branchId'
> & {
  branchId?: string | null;
};

export function useInventoryLocationsQuery(
  params: InventoryLocationsQueryParams,
  options: UseInventoryQueryOptions = {}
) {
  const normalizedBranchId = params.branchId?.trim() ?? '';
  const queryParams: ListInventoryLocationsParams = {
    ...params,
    branchId: normalizedBranchId,
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

export function useInventoryLocationQuery(
  locationId: string | null | undefined,
  options: UseInventoryQueryOptions = {}
) {
  const normalizedLocationId = locationId?.trim() ?? '';

  return useQuery({
    queryKey: inventoryKeys.locationDetail(normalizedLocationId),
    queryFn: () => {
      if (!normalizedLocationId) {
        return Promise.reject(new Error('Location ID is required.'));
      }
      return getInventoryLocation(normalizedLocationId);
    },
    enabled: Boolean(normalizedLocationId) && (options.enabled ?? true),
  });
}

export function useInventoryBatchesQuery(
  params: InventoryBatchesQueryParams,
  options: UseInventoryQueryOptions = {}
) {
  const normalizedBranchId = params.branchId?.trim() ?? '';
  const queryParams: ListInventoryBatchesParams = {
    ...params,
    branchId: normalizedBranchId,
  };

  return useQuery({
    queryKey: inventoryKeys.batchList(queryParams),
    queryFn: () => {
      if (!normalizedBranchId) {
        return Promise.reject(new Error('Branch ID is required.'));
      }
      return listInventoryBatches(queryParams);
    },
    enabled: Boolean(normalizedBranchId) && (options.enabled ?? true),
  });
}

export function useInventoryBalancesQuery(
  params: InventoryBalancesQueryParams,
  options: UseInventoryQueryOptions = {}
) {
  const normalizedBranchId = params.branchId?.trim() ?? '';
  const queryParams: ListInventoryBalancesParams = {
    ...params,
    branchId: normalizedBranchId,
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

export function useInventoryTransactionsQuery(
  params: InventoryTransactionsQueryParams,
  options: UseInventoryQueryOptions = {}
) {
  const normalizedBranchId = params.branchId?.trim() ?? '';
  const queryParams: ListInventoryTransactionsParams = {
    ...params,
    branchId: normalizedBranchId,
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

export function useInventoryTransactionQuery(
  txnId: string | null | undefined,
  options: UseInventoryQueryOptions = {}
) {
  const normalizedTxnId = txnId?.trim() ?? '';

  return useQuery({
    queryKey: inventoryKeys.transactionDetail(normalizedTxnId),
    queryFn: () => {
      if (!normalizedTxnId) {
        return Promise.reject(new Error('Transaction ID is required.'));
      }
      return getInventoryTransaction(normalizedTxnId);
    },
    enabled: Boolean(normalizedTxnId) && (options.enabled ?? true),
  });
}
