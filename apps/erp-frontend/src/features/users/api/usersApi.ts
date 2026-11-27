import { apiClient, toInvalidResponseError } from '../../../lib/api/client';
import {
  buildMutationConfig,
  type MutationRequestOptions,
} from '../../../lib/api/idempotency';
import { normalizeUser } from '../../../lib/api/identityNormalizers';
import { ContractValidationError } from '../../../lib/api/normalizers';
import {
  buildPaginationQueryParams,
  parsePagedResult,
} from '../../../lib/api/pagination';
import type {
  CreateUserRequest,
  PagedResult,
  ResetPasswordRequest,
  UpdateUserRequest,
  User,
  UserDto,
  UserDtoPagedResult,
  UserRole,
} from '../../../types/api';

export type { MutationRequestOptions };

export interface ListUsersParams {
  page?: number;
  page_size?: number;
  branch_id?: string;
  role?: UserRole;
  include_inactive?: boolean;
}

export type AllUsersKeyParams = Omit<ListUsersParams, 'page' | 'page_size'>;

function parseSingleUser(
  data: unknown,
  endpoint: string,
  status?: number
): User {
  try {
    return normalizeUser(data, endpoint);
  } catch (error: unknown) {
    if (error instanceof ContractValidationError) {
      throw toInvalidResponseError(error, status);
    }
    throw error;
  }
}

export async function listUsers(
  params: ListUsersParams = {}
): Promise<PagedResult<User>> {
  const pagination = buildPaginationQueryParams(params);
  const trimmedBranchId = params.branch_id?.trim();

  const queryParams: ListUsersParams = {
    ...pagination,
    ...(trimmedBranchId && trimmedBranchId.length > 0
      ? { branch_id: trimmedBranchId }
      : {}),
    ...(params.role !== undefined ? { role: params.role } : {}),
    ...(params.include_inactive !== undefined
      ? { include_inactive: params.include_inactive }
      : {}),
  };

  const { data } = await apiClient.get<UserDtoPagedResult>('/users', {
    params: queryParams,
  });

  return parsePagedResult(data, '/users', (item) =>
    normalizeUser(item, '/users')
  );
}

export async function getUser(userId: string): Promise<User> {
  const endpoint = `/users/${encodeURIComponent(userId)}`;
  const response = await apiClient.get<UserDto>(endpoint);
  return parseSingleUser(response.data, endpoint, response.status);
}

export async function createUser(
  payload: CreateUserRequest,
  options?: MutationRequestOptions
): Promise<User> {
  const response = await apiClient.post<UserDto>(
    '/users',
    payload,
    buildMutationConfig(options)
  );
  return parseSingleUser(response.data, '/users', response.status);
}

export async function patchUser(
  userId: string,
  payload: UpdateUserRequest,
  options?: MutationRequestOptions
): Promise<User> {
  const endpoint = `/users/${encodeURIComponent(userId)}`;
  const response = await apiClient.patch<UserDto>(
    endpoint,
    payload,
    buildMutationConfig(options)
  );
  return parseSingleUser(response.data, endpoint, response.status);
}

export async function resetUserPassword(
  userId: string,
  payload: ResetPasswordRequest,
  options?: MutationRequestOptions
): Promise<void> {
  await apiClient.post<void>(
    `/users/${encodeURIComponent(userId)}/password-reset`,
    payload,
    buildMutationConfig(options)
  );
}

export async function revokeUserSessions(
  userId: string,
  options?: MutationRequestOptions
): Promise<void> {
  await apiClient.post<void>(
    `/users/${encodeURIComponent(userId)}/revoke-sessions`,
    undefined,
    buildMutationConfig(options)
  );
}
