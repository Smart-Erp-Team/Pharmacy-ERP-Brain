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
  BranchDto,
  BranchEnrollmentRequest,
  BranchEnrollmentResult,
  BranchPatchRequest,
  BranchRequest,
  EnrollmentTokenDto,
  PagedResult,
} from '../../../types/api';

type PagedBranchDto = ApiComponents['schemas']['PagedBranchDto'];

export type { MutationRequestOptions };

export interface ListBranchesParams {
  cursor?: string;
  limit?: number;
  includeInactive?: boolean;
}

export async function listBranches(
  params: ListBranchesParams = {}
): Promise<PagedResult<BranchDto>> {
  const cursor = normalizeCursorParam(params.cursor);
  const queryParams: ListBranchesParams = {
    ...(cursor !== undefined ? { cursor } : {}),
    ...(params.limit !== undefined ? { limit: params.limit } : {}),
    ...(params.includeInactive !== undefined
      ? { includeInactive: params.includeInactive }
      : {}),
  };

  const { data } = await apiClient.get<PagedBranchDto>('/branches', {
    params: queryParams,
  });

  return parsePagedResult<BranchDto>(data, '/branches');
}

export async function getBranch(branchId: string): Promise<BranchDto> {
  const { data } = await apiClient.get<BranchDto>(`/branches/${branchId}`);
  return data;
}

export async function createBranch(
  payload: BranchRequest,
  options?: MutationRequestOptions
): Promise<BranchDto> {
  const { data } = await apiClient.post<BranchDto>(
    '/branches',
    payload,
    buildMutationConfig(options)
  );
  return data;
}

export async function patchBranch(
  branchId: string,
  payload: BranchPatchRequest,
  options?: MutationRequestOptions
): Promise<BranchDto> {
  const { data } = await apiClient.patch<BranchDto>(
    `/branches/${branchId}`,
    payload,
    buildMutationConfig(options)
  );
  return data;
}

export async function createBranchEnrollmentToken(
  branchId: string,
  options?: MutationRequestOptions
): Promise<EnrollmentTokenDto> {
  const { data } = await apiClient.post<EnrollmentTokenDto>(
    `/branches/${branchId}/enrollment-tokens`,
    undefined,
    buildMutationConfig(options)
  );
  return data;
}

export async function redeemBranchEnrollment(
  payload: BranchEnrollmentRequest,
  options?: MutationRequestOptions
): Promise<BranchEnrollmentResult> {
  const { data } = await apiClient.post<BranchEnrollmentResult>(
    '/branch-enrollment',
    payload,
    buildMutationConfig(options)
  );
  return data;
}
