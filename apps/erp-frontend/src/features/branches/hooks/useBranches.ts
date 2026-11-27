import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getStableAttemptKey,
  type AttemptKeyRecord,
} from '../../../lib/api/idempotency';
import { fetchAllPages } from '../../../lib/api/pagination';
import type {
  CreateBranchRequest,
  RedeemBranchEnrollmentRequest,
  UpdateBranchRequest,
} from '../../../types/api';
import {
  createBranch,
  createBranchEnrollmentToken,
  getBranch,
  listBranches,
  patchBranch,
  redeemBranchEnrollment,
  type ListBranchesParams,
} from '../api/branchesApi';
import { branchesKeys, type AllBranchesKeyParams } from './branchesKeys';

export interface UseBranchesQueryOptions {
  enabled?: boolean;
}

export function useBranchesQuery(
  params: ListBranchesParams = {},
  options: UseBranchesQueryOptions = {}
) {
  return useQuery({
    queryKey: branchesKeys.list(params),
    queryFn: () => listBranches(params),
    enabled: options.enabled ?? true,
  });
}

export function useBranchQuery(
  branchId: string | undefined,
  options: UseBranchesQueryOptions = {}
) {
  return useQuery({
    queryKey: branchesKeys.detail(branchId ?? ''),
    queryFn: () => {
      if (!branchId) {
        throw new Error('Branch ID is required to fetch branch details.');
      }
      return getBranch(branchId);
    },
    enabled: Boolean(branchId) && (options.enabled ?? true),
  });
}

export function useAllBranchesQuery(
  params: AllBranchesKeyParams = {},
  options: UseBranchesQueryOptions = {}
) {
  return useQuery({
    queryKey: branchesKeys.allList(params),
    queryFn: () =>
      fetchAllPages((page, pageSize) =>
        listBranches({ ...params, page, page_size: pageSize })
      ),
    enabled: options.enabled ?? true,
  });
}

export interface CreateBranchVariables {
  payload: CreateBranchRequest;
  idempotencyKey?: string;
}

export function useCreateBranchMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: CreateBranchVariables) =>
      createBranch(payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify(payload),
          idempotencyKey
        ),
      }),
    onSuccess: async () => {
      attemptRef.current = null;
      await queryClient.invalidateQueries({ queryKey: branchesKeys.lists() });
    },
  });
}

export interface PatchBranchVariables {
  branchId: string;
  payload: UpdateBranchRequest;
  idempotencyKey?: string;
}

export function usePatchBranchMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({ branchId, payload, idempotencyKey }: PatchBranchVariables) =>
      patchBranch(branchId, payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify({ branchId, payload }),
          idempotencyKey
        ),
      }),
    onSuccess: async (_branch, variables) => {
      attemptRef.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: branchesKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: branchesKeys.detail(variables.branchId),
        }),
      ]);
    },
  });
}

export interface CreateEnrollmentTokenVariables {
  branchId: string;
  idempotencyKey?: string;
}

export function useCreateEnrollmentTokenMutation() {
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({
      branchId,
      idempotencyKey,
    }: CreateEnrollmentTokenVariables) =>
      createBranchEnrollmentToken(branchId, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          branchId,
          idempotencyKey
        ),
      }),
    onSuccess: () => {
      attemptRef.current = null;
    },
  });
}

export interface RedeemBranchEnrollmentVariables {
  payload: RedeemBranchEnrollmentRequest;
}

export function useRedeemBranchEnrollmentMutation() {
  return useMutation({
    mutationFn: ({ payload }: RedeemBranchEnrollmentVariables) =>
      redeemBranchEnrollment(payload),
  });
}
