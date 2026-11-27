import { apiClient, toInvalidResponseError } from '../../../lib/api/client';
import {
  buildMutationConfig,
  type MutationRequestOptions,
} from '../../../lib/api/idempotency';
import { normalizeEmployee } from '../../../lib/api/identityNormalizers';
import { ContractValidationError } from '../../../lib/api/normalizers';
import {
  buildPaginationQueryParams,
  parsePagedResult,
} from '../../../lib/api/pagination';
import type {
  CreateEmployeeRequest,
  Employee,
  PagedResult,
  UpdateEmployeeRequest,
} from '../../../types/api';

export type { MutationRequestOptions };

export interface ListEmployeesParams {
  page?: number;
  page_size?: number;
  branch_id?: string;
  include_inactive?: boolean;
  search?: string;
}

function normalizeEmployeeResponse(data: unknown, endpoint: string): Employee {
  try {
    return normalizeEmployee(data, endpoint);
  } catch (error: unknown) {
    if (error instanceof ContractValidationError) {
      throw toInvalidResponseError(error);
    }
    throw error;
  }
}

export async function listEmployees(
  params: ListEmployeesParams = {}
): Promise<PagedResult<Employee>> {
  const branchId = params.branch_id?.trim();
  const search = params.search?.trim();
  const queryParams: ListEmployeesParams = {
    ...buildPaginationQueryParams(params),
    ...(branchId ? { branch_id: branchId } : {}),
    ...(params.include_inactive !== undefined
      ? { include_inactive: params.include_inactive }
      : {}),
    ...(search ? { search } : {}),
  };

  const { data } = await apiClient.get<unknown>('/employees', {
    params: queryParams,
  });

  return parsePagedResult<Employee>(data, '/employees', (item, index) =>
    normalizeEmployee(item, `/employees.items[${index}]`)
  );
}

export async function getEmployee(employeeId: string): Promise<Employee> {
  const endpoint = `/employees/${encodeURIComponent(employeeId.trim())}`;
  const { data } = await apiClient.get<unknown>(endpoint);
  return normalizeEmployeeResponse(data, endpoint);
}

export async function createEmployee(
  payload: CreateEmployeeRequest,
  options?: MutationRequestOptions
): Promise<Employee> {
  const { data } = await apiClient.post<unknown>(
    '/employees',
    payload,
    buildMutationConfig(options)
  );
  return normalizeEmployeeResponse(data, '/employees');
}

export async function patchEmployee(
  employeeId: string,
  payload: UpdateEmployeeRequest,
  options?: MutationRequestOptions
): Promise<Employee> {
  const endpoint = `/employees/${encodeURIComponent(employeeId.trim())}`;
  const { data } = await apiClient.patch<unknown>(
    endpoint,
    payload,
    buildMutationConfig(options)
  );
  return normalizeEmployeeResponse(data, endpoint);
}
