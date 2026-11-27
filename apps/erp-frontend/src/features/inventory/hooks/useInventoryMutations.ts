import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getStableAttemptKey,
  type AttemptKeyRecord,
} from '../../../lib/api/idempotency';
import type {
  CreateInventoryAdjustmentRequest,
  CreateInventoryLocationRequest,
  UpdateInventoryLocationRequest,
} from '../../../types/api';
import {
  createInventoryAdjustment,
  createInventoryLocation,
  patchInventoryLocation,
} from '../api/inventoryApi';
import { inventoryKeys } from './inventoryKeys';

export interface CreateInventoryLocationVariables {
  payload: CreateInventoryLocationRequest;
  idempotencyKey?: string;
}

export function useCreateInventoryLocationMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: CreateInventoryLocationVariables) =>
      createInventoryLocation(payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify(payload),
          idempotencyKey
        ),
      }),
    onSuccess: async () => {
      attemptRef.current = null;
      await queryClient.invalidateQueries({
        queryKey: inventoryKeys.locationLists(),
      });
    },
  });
}

export interface PatchInventoryLocationVariables {
  locationId: string;
  payload: UpdateInventoryLocationRequest;
  idempotencyKey?: string;
}

export function usePatchInventoryLocationMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({
      locationId,
      payload,
      idempotencyKey,
    }: PatchInventoryLocationVariables) =>
      patchInventoryLocation(locationId, payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify({ locationId: locationId.trim(), payload }),
          idempotencyKey
        ),
      }),
    onSuccess: async () => {
      attemptRef.current = null;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.locationLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.balanceLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.summaries(),
        }),
      ]);
    },
  });
}

export interface CreateInventoryAdjustmentVariables {
  payload: CreateInventoryAdjustmentRequest;
  idempotencyKey?: string;
}

export function useCreateInventoryAdjustmentMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: CreateInventoryAdjustmentVariables) =>
      createInventoryAdjustment(payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify(payload),
          idempotencyKey
        ),
      }),
    onSuccess: async () => {
      attemptRef.current = null;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.balanceLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.batchLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.summaries(),
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.transactionLists(),
        }),
      ]);
    },
  });
}
