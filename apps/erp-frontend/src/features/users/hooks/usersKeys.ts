import type { ListUsersParams } from '../api/usersApi';

export const usersKeys = {
  all: ['users'] as const,
  lists: () => [...usersKeys.all, 'list'] as const,
  list: (params: ListUsersParams = {}) =>
    [...usersKeys.lists(), params] as const,
  allList: () => [...usersKeys.lists(), 'all'] as const,
  details: () => [...usersKeys.all, 'detail'] as const,
  detail: (userId: string) => [...usersKeys.details(), userId] as const,
};
