import type {
  GetInventorySummaryParams,
  ListInventoryBalancesParams,
  ListInventoryBatchesParams,
  ListInventoryLocationsParams,
  ListInventoryTransactionsParams,
} from '../api/inventoryApi';

export type AllInventoryLocationsKeyParams = Omit<
  ListInventoryLocationsParams,
  'page' | 'page_size'
>;
export type AllInventoryBatchesKeyParams = Omit<
  ListInventoryBatchesParams,
  'page' | 'page_size'
>;
export type AllInventoryBalancesKeyParams = Omit<
  ListInventoryBalancesParams,
  'page' | 'page_size'
>;
export type AllInventoryTransactionsKeyParams = Omit<
  ListInventoryTransactionsParams,
  'page' | 'page_size'
>;

export const inventoryKeys = {
  all: ['inventory'] as const,
  locations: () => [...inventoryKeys.all, 'locations'] as const,
  locationLists: () => [...inventoryKeys.locations(), 'list'] as const,
  locationList: (params: ListInventoryLocationsParams) =>
    [...inventoryKeys.locationLists(), params] as const,
  allLocationList: (params: AllInventoryLocationsKeyParams) =>
    [...inventoryKeys.locationLists(), 'all', params] as const,
  batches: () => [...inventoryKeys.all, 'batches'] as const,
  batchLists: () => [...inventoryKeys.batches(), 'list'] as const,
  batchList: (params: ListInventoryBatchesParams = {}) =>
    [...inventoryKeys.batchLists(), params] as const,
  allBatchList: (params: AllInventoryBatchesKeyParams = {}) =>
    [...inventoryKeys.batchLists(), 'all', params] as const,
  balances: () => [...inventoryKeys.all, 'balances'] as const,
  balanceLists: () => [...inventoryKeys.balances(), 'list'] as const,
  balanceList: (params: ListInventoryBalancesParams) =>
    [...inventoryKeys.balanceLists(), params] as const,
  allBalanceList: (params: AllInventoryBalancesKeyParams) =>
    [...inventoryKeys.balanceLists(), 'all', params] as const,
  summaries: () => [...inventoryKeys.all, 'summary'] as const,
  summary: (params: GetInventorySummaryParams) =>
    [...inventoryKeys.summaries(), params] as const,
  transactions: () => [...inventoryKeys.all, 'transactions'] as const,
  transactionLists: () => [...inventoryKeys.transactions(), 'list'] as const,
  transactionList: (params: ListInventoryTransactionsParams) =>
    [...inventoryKeys.transactionLists(), params] as const,
  allTransactionList: (params: AllInventoryTransactionsKeyParams) =>
    [...inventoryKeys.transactionLists(), 'all', params] as const,
};
