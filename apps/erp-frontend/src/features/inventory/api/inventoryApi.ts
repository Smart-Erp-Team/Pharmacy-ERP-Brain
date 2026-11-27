import { apiClient, toInvalidResponseError } from '../../../lib/api/client';
import {
  normalizeInventoryBatch,
  normalizeInventoryLocation,
  normalizeInventorySummary,
  normalizeInventoryTxn,
  normalizeStockBalance,
} from '../../../lib/api/catalogInventoryNormalizers';
import {
  buildMutationConfig,
  type MutationRequestOptions,
} from '../../../lib/api/idempotency';
import { ContractValidationError } from '../../../lib/api/normalizers';
import {
  buildPaginationQueryParams,
  parsePagedResult,
} from '../../../lib/api/pagination';
import type {
  BatchQualityStatus,
  CreateInventoryAdjustmentRequest,
  CreateInventoryLocationRequest,
  InventoryBatch,
  InventoryLocation,
  InventorySummary,
  InventoryTransactionType,
  InventoryTxn,
  PagedResult,
  StockBalance,
  UpdateInventoryLocationRequest,
} from '../../../types/api';

export type { MutationRequestOptions };

export interface ListInventoryLocationsParams {
  branch_id: string;
  is_sellable?: boolean;
  include_inactive?: boolean;
  page?: number;
  page_size?: number;
}

export interface ListInventoryBatchesParams {
  product_id?: string;
  status?: BatchQualityStatus;
  expiring_before?: string;
  page?: number;
  page_size?: number;
}

export interface ListInventoryBalancesParams {
  branch_id: string;
  product_id?: string;
  location_id?: string;
  batch_id?: string;
  page?: number;
  page_size?: number;
}

export interface GetInventorySummaryParams {
  branch_id: string;
  product_id: string;
}

export interface ListInventoryTransactionsParams {
  branch_id: string;
  type?: InventoryTransactionType;
  product_id?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  page_size?: number;
}

function normalizeContractResponse<T>(
  normalizer: (raw: unknown, endpoint?: string) => T,
  data: unknown,
  endpoint: string,
  status?: number
): T {
  try {
    return normalizer(data, endpoint);
  } catch (error: unknown) {
    if (error instanceof ContractValidationError) {
      throw toInvalidResponseError(error, status);
    }
    throw error;
  }
}

export async function listInventoryLocations(
  params: ListInventoryLocationsParams
): Promise<PagedResult<InventoryLocation>> {
  const endpoint = '/inventory/locations';
  const branchId = params.branch_id.trim();
  if (!branchId) {
    throw new Error('branch_id is required.');
  }
  const queryParams: ListInventoryLocationsParams = {
    ...buildPaginationQueryParams({
      page: params.page,
      page_size: params.page_size,
    }),
    branch_id: branchId,
    ...(params.is_sellable !== undefined
      ? { is_sellable: params.is_sellable }
      : {}),
    ...(params.include_inactive !== undefined
      ? { include_inactive: params.include_inactive }
      : {}),
  };

  const { data } = await apiClient.get<unknown>(endpoint, {
    params: queryParams,
  });

  return parsePagedResult<InventoryLocation>(data, endpoint, (item) =>
    normalizeInventoryLocation(item, endpoint)
  );
}

export async function createInventoryLocation(
  payload: CreateInventoryLocationRequest,
  options?: MutationRequestOptions
): Promise<InventoryLocation> {
  const endpoint = '/inventory/locations';
  const { data, status } = await apiClient.post<unknown>(
    endpoint,
    payload,
    buildMutationConfig(options)
  );

  return normalizeContractResponse(
    normalizeInventoryLocation,
    data,
    endpoint,
    status
  );
}

export async function patchInventoryLocation(
  locationId: string,
  payload: UpdateInventoryLocationRequest,
  options?: MutationRequestOptions
): Promise<InventoryLocation> {
  const endpoint = `/inventory/locations/${encodeURIComponent(locationId.trim())}`;
  const { data, status } = await apiClient.patch<unknown>(
    endpoint,
    payload,
    buildMutationConfig(options)
  );

  return normalizeContractResponse(
    normalizeInventoryLocation,
    data,
    endpoint,
    status
  );
}

export async function listInventoryBatches(
  params: ListInventoryBatchesParams = {}
): Promise<PagedResult<InventoryBatch>> {
  const endpoint = '/inventory/batches';
  const productId = params.product_id?.trim();
  const expiringBefore = params.expiring_before?.trim();
  const queryParams: ListInventoryBatchesParams = {
    ...buildPaginationQueryParams({
      page: params.page,
      page_size: params.page_size,
    }),
    ...(productId ? { product_id: productId } : {}),
    ...(params.status !== undefined ? { status: params.status } : {}),
    ...(expiringBefore ? { expiring_before: expiringBefore } : {}),
  };

  const { data } = await apiClient.get<unknown>(endpoint, {
    params: queryParams,
  });

  return parsePagedResult<InventoryBatch>(data, endpoint, (item) =>
    normalizeInventoryBatch(item, endpoint)
  );
}

export async function listInventoryBalances(
  params: ListInventoryBalancesParams
): Promise<PagedResult<StockBalance>> {
  const endpoint = '/inventory/balances';
  const branchId = params.branch_id.trim();
  if (!branchId) {
    throw new Error('branch_id is required.');
  }
  const productId = params.product_id?.trim();
  const locationId = params.location_id?.trim();
  const batchId = params.batch_id?.trim();
  const queryParams: ListInventoryBalancesParams = {
    ...buildPaginationQueryParams({
      page: params.page,
      page_size: params.page_size,
    }),
    branch_id: branchId,
    ...(productId ? { product_id: productId } : {}),
    ...(locationId ? { location_id: locationId } : {}),
    ...(batchId ? { batch_id: batchId } : {}),
  };

  const { data } = await apiClient.get<unknown>(endpoint, {
    params: queryParams,
  });

  return parsePagedResult<StockBalance>(data, endpoint, (item) =>
    normalizeStockBalance(item, endpoint)
  );
}

export async function getInventorySummary(
  params: GetInventorySummaryParams
): Promise<InventorySummary> {
  const endpoint = '/inventory/summary';
  if (!params.branch_id.trim()) throw new Error('branch_id is required.');
  if (!params.product_id.trim()) throw new Error('product_id is required.');
  const queryParams: GetInventorySummaryParams = {
    branch_id: params.branch_id.trim(),
    product_id: params.product_id.trim(),
  };

  const { data, status } = await apiClient.get<unknown>(endpoint, {
    params: queryParams,
  });

  return normalizeContractResponse(
    normalizeInventorySummary,
    data,
    endpoint,
    status
  );
}

export async function listInventoryTransactions(
  params: ListInventoryTransactionsParams
): Promise<PagedResult<InventoryTxn>> {
  const endpoint = '/inventory/transactions';
  const branchId = params.branch_id.trim();
  if (!branchId) {
    throw new Error('branch_id is required.');
  }
  const productId = params.product_id?.trim();
  const fromDate = params.from_date?.trim();
  const toDate = params.to_date?.trim();
  const queryParams: ListInventoryTransactionsParams = {
    ...buildPaginationQueryParams({
      page: params.page,
      page_size: params.page_size,
    }),
    branch_id: branchId,
    ...(params.type !== undefined ? { type: params.type } : {}),
    ...(productId ? { product_id: productId } : {}),
    ...(fromDate ? { from_date: fromDate } : {}),
    ...(toDate ? { to_date: toDate } : {}),
  };

  const { data } = await apiClient.get<unknown>(endpoint, {
    params: queryParams,
  });

  return parsePagedResult<InventoryTxn>(data, endpoint, (item) =>
    normalizeInventoryTxn(item, endpoint)
  );
}

export async function createInventoryAdjustment(
  payload: CreateInventoryAdjustmentRequest,
  options?: MutationRequestOptions
): Promise<InventoryTxn> {
  const endpoint = '/inventory/adjustments';
  const { data, status } = await apiClient.post<unknown>(
    endpoint,
    payload,
    buildMutationConfig(options)
  );

  return normalizeContractResponse(
    normalizeInventoryTxn,
    data,
    endpoint,
    status
  );
}
