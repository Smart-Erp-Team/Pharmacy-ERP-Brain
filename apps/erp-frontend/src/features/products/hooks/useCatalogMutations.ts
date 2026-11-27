import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getStableAttemptKey,
  type AttemptKeyRecord,
} from '../../../lib/api/idempotency';
import type {
  CreateProductCategoryRequest,
  CreateProductRequest,
  CreateProductUomRequest,
  UpdateProductCategoryRequest,
  UpdateProductRequest,
  UpdateProductUomRequest,
  UpsertReorderRuleRequest,
} from '../../../types/api';
import {
  createProduct,
  createProductCategory,
  createProductUom,
  patchProduct,
  patchProductCategory,
  patchProductUom,
  upsertReorderRule,
} from '../api/catalogApi';
import { productsKeys } from './productsKeys';

export interface CreateCategoryVariables {
  payload: CreateProductCategoryRequest;
  idempotencyKey?: string;
}

export function useCreateCategoryMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: CreateCategoryVariables) =>
      createProductCategory(payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify(payload),
          idempotencyKey
        ),
      }),
    onSuccess: async () => {
      attemptRef.current = null;
      await queryClient.invalidateQueries({
        queryKey: productsKeys.categoryLists(),
      });
    },
  });
}

export interface PatchCategoryVariables {
  categoryId: string;
  payload: UpdateProductCategoryRequest;
  idempotencyKey?: string;
}

export function usePatchCategoryMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({
      categoryId,
      payload,
      idempotencyKey,
    }: PatchCategoryVariables) =>
      patchProductCategory(categoryId, payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify({ categoryId: categoryId.trim(), payload }),
          idempotencyKey
        ),
      }),
    onSuccess: async (_category, variables) => {
      attemptRef.current = null;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: productsKeys.categoryLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: productsKeys.categoryDetail(variables.categoryId.trim()),
        }),
      ]);
    },
  });
}

export interface CreateProductVariables {
  payload: CreateProductRequest;
  idempotencyKey?: string;
}

export function useCreateProductMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: CreateProductVariables) =>
      createProduct(payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify(payload),
          idempotencyKey
        ),
      }),
    onSuccess: async () => {
      attemptRef.current = null;
      await queryClient.invalidateQueries({ queryKey: productsKeys.lists() });
    },
  });
}

export interface PatchProductVariables {
  productId: string;
  payload: UpdateProductRequest;
  idempotencyKey?: string;
}

export function usePatchProductMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({
      productId,
      payload,
      idempotencyKey,
    }: PatchProductVariables) =>
      patchProduct(productId, payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify({ productId: productId.trim(), payload }),
          idempotencyKey
        ),
      }),
    onSuccess: async (_product, variables) => {
      attemptRef.current = null;
      const productId = variables.productId.trim();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productsKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: productsKeys.detail(productId),
        }),
        queryClient.invalidateQueries({
          queryKey: productsKeys.uoms(productId),
        }),
      ]);
    },
  });
}

export interface CreateProductUomVariables {
  productId: string;
  payload: CreateProductUomRequest;
  idempotencyKey?: string;
}

export function useCreateProductUomMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({
      productId,
      payload,
      idempotencyKey,
    }: CreateProductUomVariables) =>
      createProductUom(productId, payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify({ productId: productId.trim(), payload }),
          idempotencyKey
        ),
      }),
    onSuccess: async (_uom, variables) => {
      attemptRef.current = null;
      const productId = variables.productId.trim();
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: productsKeys.uoms(productId),
        }),
        queryClient.invalidateQueries({
          queryKey: productsKeys.detail(productId),
        }),
        queryClient.invalidateQueries({ queryKey: productsKeys.lists() }),
      ]);
    },
  });
}

export interface PatchProductUomVariables {
  productId: string;
  uomId: string;
  payload: UpdateProductUomRequest;
  idempotencyKey?: string;
}

export function usePatchProductUomMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({
      productId,
      uomId,
      payload,
      idempotencyKey,
    }: PatchProductUomVariables) =>
      patchProductUom(productId, uomId, payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify({
            productId: productId.trim(),
            uomId: uomId.trim(),
            payload,
          }),
          idempotencyKey
        ),
      }),
    onSuccess: async (_uom, variables) => {
      attemptRef.current = null;
      const productId = variables.productId.trim();
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: productsKeys.uoms(productId),
        }),
        queryClient.invalidateQueries({
          queryKey: productsKeys.detail(productId),
        }),
        queryClient.invalidateQueries({ queryKey: productsKeys.lists() }),
      ]);
    },
  });
}

export interface UpsertReorderRuleVariables {
  branchId: string;
  productId: string;
  payload: UpsertReorderRuleRequest;
  idempotencyKey?: string;
}

export type PutReorderRuleVariables = UpsertReorderRuleVariables;

export function useUpsertReorderRuleMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({
      branchId,
      productId,
      payload,
      idempotencyKey,
    }: UpsertReorderRuleVariables) =>
      upsertReorderRule(branchId, productId, payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify({
            branchId: branchId.trim(),
            productId: productId.trim(),
            payload,
          }),
          idempotencyKey
        ),
      }),
    onSuccess: async (_rule, variables) => {
      attemptRef.current = null;
      await queryClient.invalidateQueries({
        queryKey: productsKeys.reorderRule(
          variables.branchId.trim(),
          variables.productId.trim()
        ),
      });
    },
  });
}

export const usePutReorderRuleMutation = useUpsertReorderRuleMutation;
