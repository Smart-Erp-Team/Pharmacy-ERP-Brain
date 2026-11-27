import { Building2 } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Select } from '../../../components/ui/Select';
import { Skeleton } from '../../../components/ui/Skeleton';
import type { InventoryBranchOption } from '../hooks/useInventoryBranchState';

export interface InventoryBranchBarProps {
  branchId: string;
  branchOptions: readonly InventoryBranchOption[];
  isLoading: boolean;
  error: string | null;
  onSelectBranch: (branchId: string) => void;
  onRetry: () => void;
}

export function InventoryBranchBar({
  branchId,
  branchOptions,
  isLoading,
  error,
  onSelectBranch,
  onRetry,
}: InventoryBranchBarProps) {
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-2.5">
          <span className="bg-primary/10 text-primary mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
            <Building2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="text-body text-text font-semibold">
              Active inventory branch
            </p>
            <p className="text-body-sm text-text-secondary">
              Inventory balances, storage locations, adjustments, and ledger
              records are scoped to a single branch.
            </p>
          </div>
        </div>

        <div className="w-full sm:w-72">
          {isLoading ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-body text-text font-semibold">Branch</span>
              <Skeleton className="h-9 w-full" />
            </div>
          ) : branchOptions.length > 0 ? (
            <Select
              label="Branch"
              value={branchId}
              options={branchOptions}
              onChange={(event) => onSelectBranch(event.target.value)}
            />
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Alert
            variant="danger"
            title="Could not load branches"
            className="flex-1"
          >
            {error}
          </Alert>
          <Button variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : null}

      {!isLoading && !error && branchOptions.length === 0 ? (
        <div className="mt-3">
          <Alert variant="warning" title="No branches available">
            No active branches are assigned to your account. Contact an
            administrator to configure branch access.
          </Alert>
        </div>
      ) : null}
    </Card>
  );
}
