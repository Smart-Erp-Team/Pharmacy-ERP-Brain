import { apiClient, toInvalidResponseError } from '../../../lib/api/client';
import {
  buildMutationConfig,
  type MutationRequestOptions,
} from '../../../lib/api/idempotency';
import {
  normalizeBranch,
  normalizeEnrollmentToken,
  normalizeRedeemEnrollment,
} from '../../../lib/api/identityNormalizers';
import { ContractValidationError } from '../../../lib/api/normalizers';
import {
  buildPaginationQueryParams,
  parsePagedResult,
} from '../../../lib/api/pagination';
import type {
  Branch,
  CreateBranchRequest,
  EnrollmentToken,
  PagedResult,
  RedeemBranchEnrollmentRequest,
  RedeemEnrollment,
  UpdateBranchRequest,
} from '../../../types/api';

export type { MutationRequestOptions };

export interface ListBranchesParams {
  page?: number;
  page_size?: number;
  include_inactive?: boolean;
  search?: string;
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

export async function listBranches(
  params: ListBranchesParams = {}
): Promise<PagedResult<Branch>> {
  const trimmedSearch = params.search?.trim();
  const queryParams: ListBranchesParams = {
    ...buildPaginationQueryParams({
      page: params.page,
      page_size: params.page_size,
    }),
    ...(params.include_inactive !== undefined
      ? { include_inactive: params.include_inactive }
      : {}),
    ...(trimmedSearch && trimmedSearch.length > 0
      ? { search: trimmedSearch }
      : {}),
  };

  const { data } = await apiClient.get<unknown>('/branches', {
    params: queryParams,
  });

  return parsePagedResult<Branch>(data, '/branches', (item) =>
    normalizeBranch(item, '/branches')
  );
}

export async function getBranch(branchId: string): Promise<Branch> {
  const endpoint = `/branches/${branchId}`;
  const { data, status } = await apiClient.get<unknown>(endpoint);
  return normalizeContractResponse(normalizeBranch, data, endpoint, status);
}

export async function createBranch(
  payload: CreateBranchRequest,
  options?: MutationRequestOptions
): Promise<Branch> {
  const endpoint = '/branches';
  const { data, status } = await apiClient.post<unknown>(
    endpoint,
    payload,
    buildMutationConfig(options)
  );
  return normalizeContractResponse(normalizeBranch, data, endpoint, status);
}

export async function patchBranch(
  branchId: string,
  payload: UpdateBranchRequest,
  options?: MutationRequestOptions
): Promise<Branch> {
  const endpoint = `/branches/${branchId}`;
  const { data, status } = await apiClient.patch<unknown>(
    endpoint,
    payload,
    buildMutationConfig(options)
  );
  return normalizeContractResponse(normalizeBranch, data, endpoint, status);
}

export async function createBranchEnrollmentToken(
  branchId: string,
  options?: MutationRequestOptions
): Promise<EnrollmentToken> {
  const endpoint = `/branches/${branchId}/enrollment-tokens`;
  const { data, status } = await apiClient.post<unknown>(
    endpoint,
    undefined,
    buildMutationConfig(options)
  );
  return normalizeContractResponse(
    normalizeEnrollmentToken,
    data,
    endpoint,
    status
  );
}

/**
 * Redeems a single-use branch enrollment token (`POST /api/v1/branch-enrollment`).
 * Per Stage 1 contract (`contracts/FRONTEND.md §5.3`), this endpoint is exempt
 * from `Idempotency-Key` and must NOT send an `Idempotency-Key` header.
 */
export async function redeemBranchEnrollment(
  payload: RedeemBranchEnrollmentRequest
): Promise<RedeemEnrollment> {
  const endpoint = '/branch-enrollment';
  const { data, status } = await apiClient.post<unknown>(endpoint, payload);
  return normalizeContractResponse(
    normalizeRedeemEnrollment,
    data,
    endpoint,
    status
  );
}
