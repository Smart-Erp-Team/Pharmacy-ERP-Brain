import { apiClient } from '../../../lib/api/client';
import {
  buildMutationConfig,
  type MutationRequestOptions,
} from '../../../lib/api/idempotency';
import {
  normalizeCursorParam,
  parsePagedResult,
} from '../../../lib/api/pagination';
import type {
  ApiComponents,
  BalanceQuery,
  BatchQualityStatus,
  InventoryBalanceDto,
  InventoryBatchDto,
  InventoryLocationDto,
  InventoryLocationPatchRequest,
  InventoryLocationRequest,
  InventoryTxnDto,
  InventoryTxnPatchRequest,
  InventoryTxnRequest,
  LocationType,
  PagedResult,
  TxnHistoryQuery,
} from '../../../types/api';

type PagedInventoryLocationDto =
  ApiComponents['schemas']['PagedInventoryLocationDto'];
type PagedInventoryBatchDto =
  ApiComponents['schemas']['PagedInventoryBatchDto'];
type PagedInventoryBalanceDto =
  ApiComponents['schemas']['PagedInventoryBalanceDto'];
type PagedInventoryTxnDto = ApiComponents['schemas']['PagedInventoryTxnDto'];

export type { MutationRequestOptions };

export interface ListInventoryLocationsParams {
  branchId: string;
  cursor?: string;
  limit?: number;
  locationType?: LocationType;
  includeInactive?: boolean;
}

export interface ListInventoryBatchesParams {
  branchId: string;
  cursor?: string;
  limit?: number;
  productId?: string;
  qualityStatus?: BatchQualityStatus;
}

export interface ListInventoryBalancesParams extends BalanceQuery {
  cursor?: string;
  limit?: number;
}

export interface ListInventoryTransactionsParams extends TxnHistoryQuery {
  cursor?: string;
  limit?: number;
}

export async function listInventoryLocations(
  params: ListInventoryLocationsParams
): Promise<PagedResult<InventoryLocationDto>> {
  const branchId = params.branchId.trim();
  const cursor = normalizeCursorParam(params.cursor);
  const queryParams = {
    ...(branchId ? { branchId } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
    ...(params.limit !== undefined ? { limit: params.limit } : {}),
    ...(params.locationType !== undefined
      ? { locationType: params.locationType }
      : {}),
    ...(params.includeInactive !== undefined
      ? { includeInactive: params.includeInactive }
      : {}),
  };

  const { data } = await apiClient.get<PagedInventoryLocationDto>(
    '/inventory/locations',
    { params: queryParams }
  );

  return parsePagedResult<InventoryLocationDto>(data, '/inventory/locations');
}

export async function getInventoryLocation(
  locationId: string
): Promise<InventoryLocationDto> {
  const { data } = await apiClient.get<InventoryLocationDto>(
    `/inventory/locations/${encodeURIComponent(locationId.trim())}`
  );
  return data;
}

export async function createInventoryLocation(
  payload: InventoryLocationRequest,
  options?: MutationRequestOptions
): Promise<InventoryLocationDto> {
  const { data } = await apiClient.post<InventoryLocationDto>(
    '/inventory/locations',
    payload,
    buildMutationConfig(options)
  );
  return data;
}

export async function patchInventoryLocation(
  locationId: string,
  payload: InventoryLocationPatchRequest,
  options?: MutationRequestOptions
): Promise<InventoryLocationDto> {
  const { data } = await apiClient.patch<InventoryLocationDto>(
    `/inventory/locations/${encodeURIComponent(locationId.trim())}`,
    payload,
    buildMutationConfig(options)
  );
  return data;
}

export async function listInventoryBatches(
  params: ListInventoryBatchesParams
): Promise<PagedResult<InventoryBatchDto>> {
  const branchId = params.branchId.trim();
  const cursor = normalizeCursorParam(params.cursor);
  const productId = params.productId?.trim();
  const queryParams = {
    ...(branchId ? { branchId } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
    ...(params.limit !== undefined ? { limit: params.limit } : {}),
    ...(productId ? { productId } : {}),
    ...(params.qualityStatus !== undefined
      ? { qualityStatus: params.qualityStatus }
      : {}),
  };

  const { data } = await apiClient.get<PagedInventoryBatchDto>(
    '/inventory/batches',
    { params: queryParams }
  );

  return parsePagedResult<InventoryBatchDto>(data, '/inventory/batches');
}

export async function listInventoryBalances(
  params: ListInventoryBalancesParams
): Promise<PagedResult<InventoryBalanceDto>> {
  const branchId = params.branchId.trim();
  const cursor = normalizeCursorParam(params.cursor);
  const productId = params.productId?.trim();
  const locationId = params.locationId?.trim();
  const batchId = params.batchId?.trim();
  const queryParams = {
    ...(branchId ? { branchId } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
    ...(params.limit !== undefined ? { limit: params.limit } : {}),
    ...(productId ? { productId } : {}),
    ...(locationId ? { locationId } : {}),
    ...(batchId ? { batchId } : {}),
  };

  const { data } = await apiClient.get<PagedInventoryBalanceDto>(
    '/inventory/balances',
    { params: queryParams }
  );

  return parsePagedResult<InventoryBalanceDto>(data, '/inventory/balances');
}

export async function listInventoryTransactions(
  params: ListInventoryTransactionsParams
): Promise<PagedResult<InventoryTxnDto>> {
  const branchId = params.branchId.trim();
  const cursor = normalizeCursorParam(params.cursor);
  const productId = params.productId?.trim();
  const from = params.from?.trim();
  const to = params.to?.trim();
  const queryParams = {
    ...(branchId ? { branchId } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
    ...(params.limit !== undefined ? { limit: params.limit } : {}),
    ...(params.transactionType !== undefined
      ? { transactionType: params.transactionType }
      : {}),
    ...(productId ? { productId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };

  const { data } = await apiClient.get<PagedInventoryTxnDto>(
    '/inventory/transactions',
    { params: queryParams }
  );

  return parsePagedResult<InventoryTxnDto>(data, '/inventory/transactions');
}

export async function getInventoryTransaction(
  txnId: string
): Promise<InventoryTxnDto> {
  const { data } = await apiClient.get<InventoryTxnDto>(
    `/inventory/transactions/${encodeURIComponent(txnId.trim())}`
  );
  return data;
}

export async function postInventoryAdjustment(
  payload: InventoryTxnRequest,
  options?: MutationRequestOptions
): Promise<InventoryTxnDto> {
  const { data } = await apiClient.post<InventoryTxnDto>(
    '/inventory/adjustments',
    payload,
    buildMutationConfig(options)
  );
  return data;
}

export async function patchInventoryAdjustment(
  txnId: string,
  payload: InventoryTxnPatchRequest,
  options?: MutationRequestOptions
): Promise<InventoryTxnDto> {
  const { data } = await apiClient.patch<InventoryTxnDto>(
    `/inventory/adjustments/${encodeURIComponent(txnId.trim())}`,
    payload,
    buildMutationConfig(options)
  );
  return data;
}

export async function postInventoryAdjustmentById(
  txnId: string,
  options?: MutationRequestOptions
): Promise<InventoryTxnDto> {
  const { data } = await apiClient.post<InventoryTxnDto>(
    `/inventory/adjustments/${encodeURIComponent(txnId.trim())}`,
    undefined,
    buildMutationConfig(options)
  );
  return data;
}

export async function cancelInventoryAdjustment(
  txnId: string,
  options?: MutationRequestOptions
): Promise<void> {
  await apiClient.post<void>(
    `/inventory/adjustments/${encodeURIComponent(txnId.trim())}/cancel`,
    undefined,
    buildMutationConfig(options)
  );
}
