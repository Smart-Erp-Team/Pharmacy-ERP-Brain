import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getStableAttemptKey,
  type AttemptKeyRecord,
} from '../../../lib/api/idempotency';
import type {
  InventoryLocationPatchRequest,
  InventoryLocationRequest,
  InventoryTxnPatchRequest,
  InventoryTxnRequest,
} from '../../../types/api';
import {
  cancelInventoryAdjustment,
  createInventoryLocation,
  patchInventoryAdjustment,
  patchInventoryLocation,
  postInventoryAdjustment,
  postInventoryAdjustmentById,
} from '../api/inventoryApi';
import { inventoryKeys } from './inventoryKeys';

export interface CreateInventoryLocationVariables {
  payload: InventoryLocationRequest;
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
  payload: InventoryLocationPatchRequest;
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
    onSuccess: async (_location, variables) => {
      attemptRef.current = null;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.locationLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.locationDetail(variables.locationId.trim()),
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.balanceLists(),
        }),
      ]);
    },
  });
}

export interface PostInventoryAdjustmentVariables {
  payload: InventoryTxnRequest;
  idempotencyKey?: string;
}

export function usePostInventoryAdjustmentMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: PostInventoryAdjustmentVariables) =>
      postInventoryAdjustment(payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify(payload),
          idempotencyKey
        ),
      }),
    onSuccess: async (txn) => {
      attemptRef.current = null;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.transactionLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.transactionDetail(txn.inventory_txn_id),
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.balanceLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.batchLists(),
        }),
      ]);
    },
  });
}

export interface PatchInventoryAdjustmentVariables {
  txnId: string;
  payload: InventoryTxnPatchRequest;
  idempotencyKey?: string;
}

export function usePatchInventoryAdjustmentMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({
      txnId,
      payload,
      idempotencyKey,
    }: PatchInventoryAdjustmentVariables) =>
      patchInventoryAdjustment(txnId, payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify({ txnId: txnId.trim(), payload }),
          idempotencyKey
        ),
      }),
    onSuccess: async (_txn, variables) => {
      attemptRef.current = null;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.transactionLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.transactionDetail(variables.txnId.trim()),
        }),
      ]);
    },
  });
}

export interface PostInventoryAdjustmentByIdVariables {
  txnId: string;
  idempotencyKey?: string;
}

export function usePostInventoryAdjustmentByIdMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({
      txnId,
      idempotencyKey,
    }: PostInventoryAdjustmentByIdVariables) =>
      postInventoryAdjustmentById(txnId, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          txnId.trim(),
          idempotencyKey
        ),
      }),
    onSuccess: async (_txn, variables) => {
      attemptRef.current = null;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.transactionLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.transactionDetail(variables.txnId.trim()),
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.balanceLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.batchLists(),
        }),
      ]);
    },
  });
}

export interface CancelInventoryAdjustmentVariables {
  txnId: string;
  idempotencyKey?: string;
}

export function useCancelInventoryAdjustmentMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({
      txnId,
      idempotencyKey,
    }: CancelInventoryAdjustmentVariables) =>
      cancelInventoryAdjustment(txnId, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          txnId.trim(),
          idempotencyKey
        ),
      }),
    onSuccess: async (_void, variables) => {
      attemptRef.current = null;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.transactionLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: inventoryKeys.transactionDetail(variables.txnId.trim()),
        }),
      ]);
    },
  });
}
