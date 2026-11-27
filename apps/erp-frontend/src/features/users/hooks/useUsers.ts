import { useRef } from 'react';
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  getStableAttemptKey,
  type AttemptKeyRecord,
} from '../../../lib/api/idempotency';
import { fetchAllPages } from '../../../lib/api/pagination';
import {
  createUser,
  getUser,
  listUsers,
  patchUser,
  resetUserPassword,
  revokeUserSessions,
  type AllUsersKeyParams,
  type ListUsersParams,
} from '../api/usersApi';
import { usersKeys } from './usersKeys';
import type {
  CreateUserRequest,
  ResetPasswordRequest,
  UpdateUserRequest,
} from '../../../types/api';

export type { AllUsersKeyParams, ListUsersParams };

export interface UseUsersQueryOptions {
  enabled?: boolean;
}

export function useUsersQuery(
  params: ListUsersParams = {},
  options: UseUsersQueryOptions = {}
) {
  return useQuery({
    queryKey: usersKeys.list(params),
    queryFn: () => listUsers(params),
    enabled: options.enabled ?? true,
  });
}

function usersDirectoryOptions(params: AllUsersKeyParams) {
  return {
    queryKey: usersKeys.allList(params),
    queryFn: () =>
      fetchAllPages((page, pageSize) =>
        listUsers({ ...params, page, page_size: pageSize })
      ),
  };
}

export function useAllUsersQuery(
  params: AllUsersKeyParams = {},
  options: UseUsersQueryOptions = {}
) {
  return useQuery({
    ...usersDirectoryOptions(params),
    enabled: options.enabled ?? true,
  });
}

export function useScopedUsersDirectory(
  branchIds: readonly string[] | null,
  enabled: boolean
) {
  const scopes =
    branchIds === null
      ? [{}]
      : [...new Set(branchIds)].map((branch_id) => ({ branch_id }));
  return useQueries({
    queries: enabled
      ? scopes.map((scope) =>
          usersDirectoryOptions({ ...scope, include_inactive: true })
        )
      : [],
    combine: (results) => ({
      data:
        results.length > 0 && results.every((r) => r.isSuccess)
          ? results.flatMap((r) => r.data ?? [])
          : undefined,
      isPending: results.some((r) => r.isPending),
      isFetching: results.some((r) => r.isFetching),
      isError: results.some((r) => r.isError),
      refetch: () =>
        Promise.all(results.filter((r) => r.isError).map((r) => r.refetch())),
    }),
  });
}

export interface UseUserQueryOptions {
  enabled?: boolean;
}

export function useUserQuery(
  userId: string | undefined,
  options: UseUserQueryOptions = {}
) {
  const normalizedUserId = userId?.trim() ?? '';

  return useQuery({
    queryKey: usersKeys.detail(normalizedUserId),
    queryFn: () => {
      if (!normalizedUserId) {
        return Promise.reject(new Error('User ID is required.'));
      }
      return getUser(normalizedUserId);
    },
    enabled: normalizedUserId.length > 0 && (options.enabled ?? true),
  });
}

export interface CreateUserVariables {
  payload: CreateUserRequest;
  idempotencyKey?: string;
}

export function useCreateUserMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: CreateUserVariables) =>
      createUser(payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify(payload),
          idempotencyKey
        ),
      }),
    onSuccess: async () => {
      attemptRef.current = null;
      await queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
    },
  });
}

export interface PatchUserVariables {
  userId: string;
  payload: UpdateUserRequest;
  idempotencyKey?: string;
}

export function usePatchUserMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({ userId, payload, idempotencyKey }: PatchUserVariables) =>
      patchUser(userId, payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify({ userId, payload }),
          idempotencyKey
        ),
      }),
    onSuccess: async (_user, variables) => {
      attemptRef.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: usersKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: usersKeys.detail(variables.userId.trim()),
        }),
      ]);
    },
  });
}

export interface ResetUserPasswordVariables {
  userId: string;
  payload: ResetPasswordRequest;
  idempotencyKey?: string;
}

export function useResetUserPasswordMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({
      userId,
      payload,
      idempotencyKey,
    }: ResetUserPasswordVariables) =>
      resetUserPassword(userId, payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify({ userId, payload }),
          idempotencyKey
        ),
      }),
    onSuccess: async (_data, variables) => {
      attemptRef.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: usersKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: usersKeys.detail(variables.userId.trim()),
        }),
      ]);
    },
  });
}

export interface RevokeUserSessionsVariables {
  userId: string;
  idempotencyKey?: string;
}

export function useRevokeUserSessionsMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({ userId, idempotencyKey }: RevokeUserSessionsVariables) =>
      revokeUserSessions(userId, {
        idempotencyKey: getStableAttemptKey(attemptRef, userId, idempotencyKey),
      }),
    onSuccess: async (_data, variables) => {
      attemptRef.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: usersKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: usersKeys.detail(variables.userId.trim()),
        }),
      ]);
    },
  });
}
