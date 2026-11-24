import { apiClient } from '../../../lib/api/client';
import {
  buildMutationConfig,
  type MutationRequestOptions,
} from '../../../lib/api/idempotency';
import { parsePagedResult } from '../../../lib/api/pagination';
import type {
  ApiComponents,
  CreateUserRequest,
  PagedResult,
  PasswordResetRequest,
  UserDto,
  UserPatchRequest,
} from '../../../types/api';

type PagedUserDto = ApiComponents['schemas']['PagedUserDto'];

export type { MutationRequestOptions };

export interface ListUsersParams {
  cursor?: string;
  limit?: number;
}

export async function listUsers(
  params: ListUsersParams = {}
): Promise<PagedResult<UserDto>> {
  const cursor = params.cursor?.trim();
  const queryParams: ListUsersParams = {
    ...(cursor ? { cursor } : {}),
    ...(params.limit !== undefined ? { limit: params.limit } : {}),
  };

  const { data } = await apiClient.get<PagedUserDto>('/users', {
    params: queryParams,
  });

  return parsePagedResult<UserDto>(data, '/users');
}

export async function getUser(userId: string): Promise<UserDto> {
  const { data } = await apiClient.get<UserDto>(
    `/users/${encodeURIComponent(userId)}`
  );
  return data;
}

export async function createUser(
  payload: CreateUserRequest,
  options?: MutationRequestOptions
): Promise<UserDto> {
  const { data } = await apiClient.post<UserDto>(
    '/users',
    payload,
    buildMutationConfig(options)
  );
  return data;
}

export async function patchUser(
  userId: string,
  payload: UserPatchRequest,
  options?: MutationRequestOptions
): Promise<UserDto> {
  const { data } = await apiClient.patch<UserDto>(
    `/users/${encodeURIComponent(userId)}`,
    payload,
    buildMutationConfig(options)
  );
  return data;
}

export async function resetUserPassword(
  userId: string,
  payload: PasswordResetRequest,
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
