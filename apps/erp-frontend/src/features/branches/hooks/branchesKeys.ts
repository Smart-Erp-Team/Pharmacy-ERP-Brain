import type { ListBranchesParams } from '../api/branchesApi';

export const branchesKeys = {
  all: ['branches'] as const,
  lists: () => [...branchesKeys.all, 'list'] as const,
  list: (params: ListBranchesParams) =>
    [...branchesKeys.lists(), params] as const,
  details: () => [...branchesKeys.all, 'detail'] as const,
  detail: (branchId: string) => [...branchesKeys.details(), branchId] as const,
};
