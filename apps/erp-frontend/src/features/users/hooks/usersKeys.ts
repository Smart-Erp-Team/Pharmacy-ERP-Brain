import type { AllUsersKeyParams, ListUsersParams } from '../api/usersApi';

export type { AllUsersKeyParams, ListUsersParams };

export const usersKeys = {
  all: ['users'] as const,
  lists: () => [...usersKeys.all, 'list'] as const,
  list: (params: ListUsersParams = {}) =>
    [...usersKeys.lists(), params] as const,
  allList: (params: AllUsersKeyParams = {}) =>
    [...usersKeys.lists(), 'all', params] as const,
  details: () => [...usersKeys.all, 'detail'] as const,
  detail: (userId: string) => [...usersKeys.details(), userId] as const,
};
