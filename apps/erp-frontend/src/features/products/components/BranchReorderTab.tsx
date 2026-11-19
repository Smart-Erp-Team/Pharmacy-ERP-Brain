import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Select } from '../../../components/ui/Select';
import { Skeleton } from '../../../components/ui/Skeleton';
import type { ProductDto } from '../../../types/api';
import { formatCatalogApiError } from '../hooks/useProductUomsTab';
import { useBranchReorderTab } from '../hooks/useReorderRuleForm';
import { ReorderRuleForm } from './ReorderRuleForm';

export interface BranchReorderTabProps {
  product: ProductDto;
}

function RetryAlert({
  title,
  msg,
  busy,
  onRetry,
}: {
  title: string;
  msg: string;
  busy: boolean;
  onRetry: () => void;
}) {
  return (
    <Alert variant="danger" title={title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{msg}</span>
        <Button variant="secondary" isLoading={busy} onClick={onRetry}>
          Retry
        </Button>
      </div>
    </Alert>
  );
}

export function BranchReorderTab({ product }: BranchReorderTabProps) {
  const {
    isAdmin,
    canRead,
    canWrite,
    runtime,
    branchesQ,
    options,
    branchId,
    setSelectedId,
    ruleQ,
  } = useBranchReorderTab(product.product_id);

  return (
    <Card>
      <CardHeader
        title="Branch Reorder Settings"
        description="Branch-specific stock thresholds measured in the product base unit."
        action={
          <Badge variant="info">Base unit: {product.base_uom_code}</Badge>
        }
      />
      <div className="flex flex-col gap-4 p-4">
        {!canRead ? (
          <Alert variant="warning" title="Access restricted">
            Reorder configuration is available to Admin and Pharmacist roles
            only.
          </Alert>
        ) : isAdmin && branchesQ.isLoading ? (
          <div role="status" aria-busy="true" aria-label="Loading branches">
            <Skeleton className="h-9 w-72" />
          </div>
        ) : isAdmin && branchesQ.isError ? (
          <RetryAlert
            title="Could not load branches"
            msg={formatCatalogApiError(
              branchesQ.error,
              'Unable to load branches.'
            )}
            busy={branchesQ.isFetching}
            onRetry={() => void branchesQ.refetch()}
          />
        ) : options.length === 0 ? (
          <EmptyState
            title="No branches available"
            description="No active permitted branches were found for reorder configuration."
          />
        ) : (
          <>
            <div className="max-w-sm">
              <Select
                label="Branch"
                options={options}
                value={branchId}
                onChange={(e) => setSelectedId(e.target.value)}
              />
            </div>
            {ruleQ.isError ? (
              <RetryAlert
                title="Could not load reorder rule"
                msg={formatCatalogApiError(
                  ruleQ.error,
                  'Unable to load reorder rule.'
                )}
                busy={ruleQ.isFetching}
                onRetry={() => void ruleQ.refetch()}
              />
            ) : ruleQ.isLoading ? (
              <div
                role="status"
                aria-busy="true"
                aria-label="Loading reorder rule"
              >
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <ReorderRuleForm
                key={`${product.product_id}-${branchId}-${ruleQ.dataUpdatedAt}`}
                branchId={branchId}
                product={product}
                rule={ruleQ.data ?? null}
                canWrite={canWrite}
                runtime={runtime}
              />
            )}
          </>
        )}
      </div>
    </Card>
  );
}
