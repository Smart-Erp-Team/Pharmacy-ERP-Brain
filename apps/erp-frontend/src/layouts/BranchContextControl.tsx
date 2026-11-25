import { useEffect } from 'react';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { useAllBranchesQuery } from '../features/branches';
import { useAuth } from '../hooks/useAuth';

/**
 * Topbar active-branch selector (Stage 1 Slice 1).
 * - ALL scope (typically Admin): fetches active branches when Admin and lets
 *   the user switch between All branches and any active branch.
 * - ASSIGNED scope with multiple branch IDs: switches strictly within `branch_ids`
 *   (enriching labels when Admin branch data is loaded).
 * - ASSIGNED scope with a single branch ID: renders a locked branch badge.
 */
export function BranchContextControl() {
  const {
    currentUser,
    isAuthenticated,
    branchScope,
    branchIds,
    activeBranchId,
    setActiveBranch,
    hasRole,
  } = useAuth();

  const isAdmin = hasRole('Admin');
  const branchesQuery = useAllBranchesQuery(
    { includeInactive: false },
    { enabled: isAuthenticated && isAdmin }
  );

  const loadedBranches = branchesQuery.data ?? [];
  const activeBranchMissing =
    isAuthenticated &&
    isAdmin &&
    branchScope === 'ALL' &&
    branchesQuery.isSuccess &&
    activeBranchId !== null &&
    !loadedBranches.some((branch) => branch.branch_id === activeBranchId);

  useEffect(() => {
    if (activeBranchMissing) {
      setActiveBranch(null);
    }
  }, [activeBranchMissing, setActiveBranch]);

  if (!isAuthenticated || !currentUser) {
    return null;
  }

  const formatAssignedLabel = (branchId: string): string => {
    const matched = loadedBranches.find(
      (branch) => branch.branch_id === branchId
    );
    return matched
      ? `${matched.code} — ${matched.name}`
      : `Branch ${branchId.slice(0, 8)}`;
  };

  if (branchScope === 'ALL') {
    if (isAdmin && branchesQuery.isLoading) {
      return <Badge variant="neutral">Loading branches...</Badge>;
    }

    if (isAdmin && branchesQuery.isError) {
      return <Badge variant="warning">Branches unavailable</Badge>;
    }

    if (loadedBranches.length === 0) {
      return <Badge variant="neutral">All branches</Badge>;
    }

    const options = [
      { value: '', label: 'All branches' },
      ...loadedBranches.map((branch) => ({
        value: branch.branch_id,
        label: `${branch.code} — ${branch.name}`,
      })),
    ];

    return (
      <div className="w-56">
        <Select
          aria-label="Active branch"
          options={options}
          value={activeBranchMissing ? '' : (activeBranchId ?? '')}
          onChange={(event) => setActiveBranch(event.target.value || null)}
        />
      </div>
    );
  }

  if (branchIds.length === 0) {
    return <Badge variant="warning">No branch assigned</Badge>;
  }

  if (branchIds.length === 1) {
    const branchId = branchIds[0];
    return (
      <Badge variant="neutral" dot>
        {formatAssignedLabel(branchId)}
      </Badge>
    );
  }

  const assignedOptions = branchIds.map((branchId) => ({
    value: branchId,
    label: formatAssignedLabel(branchId),
  }));

  const currentAssignedValue =
    activeBranchId && branchIds.includes(activeBranchId)
      ? activeBranchId
      : branchIds[0];

  return (
    <div className="w-48">
      <Select
        aria-label="Active branch"
        options={assignedOptions}
        value={currentAssignedValue}
        onChange={(event) => setActiveBranch(event.target.value)}
      />
    </div>
  );
}
