import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getStableAttemptKey,
  type AttemptKeyRecord,
} from '../../../lib/api/idempotency';
import { fetchAllPages } from '../../../lib/api/pagination';
import type {
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
} from '../../../types/api';
import {
  createEmployee,
  getEmployee,
  listEmployees,
  patchEmployee,
  type ListEmployeesParams,
} from '../api/employeesApi';
import { employeesKeys, type AllEmployeesKeyParams } from './employeesKeys';

export interface UseEmployeesQueryOptions {
  enabled?: boolean;
}

export function useEmployeesQuery(
  params: ListEmployeesParams = {},
  options: UseEmployeesQueryOptions = {}
) {
  return useQuery({
    queryKey: employeesKeys.list(params),
    queryFn: () => listEmployees(params),
    enabled: options.enabled ?? true,
  });
}

export function useAllEmployeesQuery(
  params: AllEmployeesKeyParams = {},
  options: UseEmployeesQueryOptions = {}
) {
  return useQuery({
    queryKey: employeesKeys.allList(params),
    queryFn: () =>
      fetchAllPages((page, pageSize) =>
        listEmployees({ ...params, page, page_size: pageSize })
      ),
    enabled: options.enabled ?? true,
  });
}

export interface UseEmployeeQueryOptions {
  enabled?: boolean;
}

export function useEmployeeQuery(
  employeeId: string | undefined,
  options: UseEmployeeQueryOptions = {}
) {
  const normalizedEmployeeId = employeeId?.trim() ?? '';

  return useQuery({
    queryKey: employeesKeys.detail(normalizedEmployeeId),
    queryFn: () => {
      if (!normalizedEmployeeId) {
        return Promise.reject(new Error('Employee ID is required.'));
      }
      return getEmployee(normalizedEmployeeId);
    },
    enabled: normalizedEmployeeId.length > 0 && (options.enabled ?? true),
  });
}

export interface CreateEmployeeVariables {
  payload: CreateEmployeeRequest;
  idempotencyKey?: string;
}

export function useCreateEmployeeMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: CreateEmployeeVariables) =>
      createEmployee(payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify(payload),
          idempotencyKey
        ),
      }),
    onSuccess: async () => {
      attemptRef.current = null;
      await queryClient.invalidateQueries({ queryKey: employeesKeys.lists() });
    },
  });
}

export interface PatchEmployeeVariables {
  employeeId: string;
  payload: UpdateEmployeeRequest;
  idempotencyKey?: string;
}

export function usePatchEmployeeMutation() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<AttemptKeyRecord | null>(null);

  return useMutation({
    mutationFn: ({
      employeeId,
      payload,
      idempotencyKey,
    }: PatchEmployeeVariables) =>
      patchEmployee(employeeId, payload, {
        idempotencyKey: getStableAttemptKey(
          attemptRef,
          JSON.stringify({ employeeId, payload }),
          idempotencyKey
        ),
      }),
    onSuccess: async (_employee, variables) => {
      attemptRef.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeesKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: employeesKeys.detail(variables.employeeId.trim()),
        }),
      ]);
    },
  });
}
