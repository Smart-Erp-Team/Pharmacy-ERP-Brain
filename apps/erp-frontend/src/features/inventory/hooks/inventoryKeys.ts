import type {
  ListInventoryBalancesParams,
  ListInventoryBatchesParams,
  ListInventoryLocationsParams,
  ListInventoryTransactionsParams,
} from '../api/inventoryApi';

export const inventoryKeys = {
  all: ['inventory'] as const,
  locations: () => [...inventoryKeys.all, 'locations'] as const,
  locationLists: () => [...inventoryKeys.locations(), 'list'] as const,
  locationList: (params: ListInventoryLocationsParams) =>
    [...inventoryKeys.locationLists(), params] as const,
  locationDetail: (locationId: string) =>
    [...inventoryKeys.locations(), 'detail', locationId] as const,
  batches: () => [...inventoryKeys.all, 'batches'] as const,
  batchLists: () => [...inventoryKeys.batches(), 'list'] as const,
  batchList: (params: ListInventoryBatchesParams) =>
    [...inventoryKeys.batchLists(), params] as const,
  balances: () => [...inventoryKeys.all, 'balances'] as const,
  balanceLists: () => [...inventoryKeys.balances(), 'list'] as const,
  balanceList: (params: ListInventoryBalancesParams) =>
    [...inventoryKeys.balanceLists(), params] as const,
  transactions: () => [...inventoryKeys.all, 'transactions'] as const,
  transactionLists: () => [...inventoryKeys.transactions(), 'list'] as const,
  transactionList: (params: ListInventoryTransactionsParams) =>
    [...inventoryKeys.transactionLists(), params] as const,
  transactionDetail: (txnId: string) =>
    [...inventoryKeys.transactions(), 'detail', txnId] as const,
};
