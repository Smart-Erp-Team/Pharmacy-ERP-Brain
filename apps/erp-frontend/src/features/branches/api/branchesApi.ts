import { apiClient } from '../../../lib/api/client';
import { IDEMPOTENCY_KEY_HEADER } from '../../../lib/api/idempotency';
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

export interface ListBranchesParams {
  cursor?: string;
  limit?: number;
  includeInactive?: boolean;
}

export interface MutationRequestOptions {
  idempotencyKey?: string;
}

const buildMutationConfig = (options?: MutationRequestOptions) =>
  options?.idempotencyKey
    ? { headers: { [IDEMPOTENCY_KEY_HEADER]: options.idempotencyKey } }
    : undefined;

export async function listBranches(
  params: ListBranchesParams = {}
): Promise<PagedResult<BranchDto>> {
  const { data } = await apiClient.get<PagedBranchDto>('/branches', {
    params,
  });

  return {
    items: data.items ?? [],
    nextCursor: data.nextCursor,
  };
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
