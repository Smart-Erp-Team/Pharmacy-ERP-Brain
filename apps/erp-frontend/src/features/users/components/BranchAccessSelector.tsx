import { useId } from 'react';
import { Skeleton } from '../../../components/ui/Skeleton';
import type { Branch } from '../../../features/branches';

export interface BranchAccessSelectorProps {
  branches: readonly Branch[];
  selectedBranchIds: readonly string[];
  isLoading: boolean;
  isError: boolean;
  disabled?: boolean;
  error?: string;
  onToggleBranch: (branchId: string) => void;
}

export function BranchAccessSelector({
  branches,
  selectedBranchIds,
  isLoading,
  isError,
  disabled = false,
  error,
  onToggleBranch,
}: BranchAccessSelectorProps) {
  const generatedId = useId();
  const labelId = `${generatedId}-label`;
  const errorId = `${generatedId}-error`;
  const hintId = `${generatedId}-hint`;
  const selectedSet = new Set(selectedBranchIds);
  const selectableBranches = branches.filter(
    (branch) => branch.is_active || selectedSet.has(branch.branch_id)
  );
  const describedBy = error ? errorId : hintId;

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-body text-text font-semibold">
        Permitted branches
      </span>

      {isLoading ? (
        <Skeleton className="h-9 w-full" />
      ) : isError && selectableBranches.length === 0 ? (
        <p className="text-body-sm text-text-muted italic">
          Branch options are unavailable. Retry loading branches above.
        </p>
      ) : selectableBranches.length === 0 ? (
        <p className="text-body-sm text-text-muted">
          No active branches available.
        </p>
      ) : (
        <div
          role="group"
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          className="flex flex-wrap gap-2"
        >
          {selectableBranches.map((branch) => {
            const isSelected = selectedSet.has(branch.branch_id);
            return (
              <button
                key={branch.branch_id}
                type="button"
                aria-pressed={isSelected}
                disabled={disabled}
                onClick={() => onToggleBranch(branch.branch_id)}
                className={`text-body focus-visible:ring-primary/40 inline-flex min-h-9 items-center gap-2 rounded-sm border px-3 py-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
                  isSelected
                    ? 'border-primary bg-primary-soft text-primary font-semibold'
                    : 'border-border-strong bg-surface text-text hover:bg-background font-medium'
                }`}
              >
                <span className="font-mono">{branch.branch_code}</span>
                <span>
                  {branch.name}
                  {!branch.is_active ? ' (Inactive)' : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-body-sm text-danger font-medium"
        >
          {error}
        </p>
      ) : (
        <p id={hintId} className="text-body-sm text-text-muted">
          Select one or more active branches this user can access.
        </p>
      )}
    </div>
  );
}
