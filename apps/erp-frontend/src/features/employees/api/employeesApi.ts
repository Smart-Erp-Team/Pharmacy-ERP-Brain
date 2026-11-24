import { apiClient } from '../../../lib/api/client';
import {
  buildMutationConfig,
  type MutationRequestOptions,
} from '../../../lib/api/idempotency';
import { parsePagedResult } from '../../../lib/api/pagination';
import type {
  ApiComponents,
  EmployeeDto,
  EmployeePatchRequest,
  EmployeeRequest,
  PagedResult,
} from '../../../types/api';

type PagedEmployeeDto = ApiComponents['schemas']['PagedEmployeeDto'];

export type { MutationRequestOptions };

export interface ListEmployeesParams {
  cursor?: string;
  limit?: number;
  branchId?: string;
}

export async function listEmployees(
  params: ListEmployeesParams = {}
): Promise<PagedResult<EmployeeDto>> {
  const cursor = params.cursor?.trim();
  const branchId = params.branchId?.trim();
  const queryParams: ListEmployeesParams = {
    ...(cursor ? { cursor } : {}),
    ...(params.limit !== undefined ? { limit: params.limit } : {}),
    ...(branchId ? { branchId } : {}),
  };

  const { data } = await apiClient.get<PagedEmployeeDto>('/employees', {
    params: queryParams,
  });

  return parsePagedResult<EmployeeDto>(data, '/employees');
}

export async function getEmployee(employeeId: string): Promise<EmployeeDto> {
  const { data } = await apiClient.get<EmployeeDto>(
    `/employees/${encodeURIComponent(employeeId.trim())}`
  );
  return data;
}

export async function createEmployee(
  payload: EmployeeRequest,
  options?: MutationRequestOptions
): Promise<EmployeeDto> {
  const { data } = await apiClient.post<EmployeeDto>(
    '/employees',
    payload,
    buildMutationConfig(options)
  );
  return data;
}

export async function patchEmployee(
  employeeId: string,
  payload: EmployeePatchRequest,
  options?: MutationRequestOptions
): Promise<EmployeeDto> {
  const { data } = await apiClient.patch<EmployeeDto>(
    `/employees/${encodeURIComponent(employeeId.trim())}`,
    payload,
    buildMutationConfig(options)
  );
  return data;
}
