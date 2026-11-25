import type { ListEmployeesParams } from '../api/employeesApi';

export type AllEmployeesKeyParams = Omit<
  ListEmployeesParams,
  'cursor' | 'limit'
>;

export const employeesKeys = {
  all: ['employees'] as const,
  lists: () => [...employeesKeys.all, 'list'] as const,
  list: (params: ListEmployeesParams) =>
    [...employeesKeys.lists(), params] as const,
  allList: (params: AllEmployeesKeyParams = {}) =>
    [...employeesKeys.lists(), 'all', params] as const,
  details: () => [...employeesKeys.all, 'detail'] as const,
  detail: (employeeId: string) =>
    [...employeesKeys.details(), employeeId] as const,
};
