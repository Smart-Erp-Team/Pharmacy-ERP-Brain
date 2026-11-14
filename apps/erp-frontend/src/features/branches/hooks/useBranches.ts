import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createIdempotencyKey } from '../../../lib/api/idempotency';
import {
  createBranch,
  createBranchEnrollmentToken,
  patchBranch,
  redeemBranchEnrollment,
  listBranches,
  type ListBranchesParams,
} from '../api/branchesApi';
import { branchesKeys } from './branchesKeys';
import type {
  BranchEnrollmentRequest,
  BranchPatchRequest,
  BranchRequest,
} from '../../../types/api';

interface AttemptRecord {
  signature: string;
  key: string;
}

function getStableAttemptKey(
  attemptRef: { current: AttemptRecord | null },
  signature: string,
  explicitKey?: string
): string {
  if (explicitKey) {
    return explicitKey;
  }
  if (attemptRef.current?.signature === signature) {
    return attemptRef.current.key;
  }
  const key = createIdempotencyKey();
  attemptRef.current = { signature, key };
  return key;
}

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

export interface CreateBranchVariables {
  payload: BranchRequest;
  idempotencyKey?: string;
}

export function useCreateBranchMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptRecord | null>(null);

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
  payload: BranchPatchRequest;
  idempotencyKey?: string;
}

export function usePatchBranchMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptRecord | null>(null);

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
  const attemptRef = useRef<AttemptRecord | null>(null);

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
  payload: BranchEnrollmentRequest;
  idempotencyKey?: string;
}

export function useRedeemBranchEnrollmentMutation() {
  const attemptRef = useRef<AttemptRecord | null>(null);

  return useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: RedeemBranchEnrollmentVariables) =>
      redeemBranchEnrollment(payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify(payload),
          idempotencyKey
        ),
      }),
    onSuccess: () => {
      attemptRef.current = null;
    },
  });
}
