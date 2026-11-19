import { Plus } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/Table';
import type { ProductDto } from '../../../types/api';
import {
  formatCatalogApiError,
  useProductUomsTab,
} from '../hooks/useProductUomsTab';
import { ProductUomFormModal } from './ProductUomFormModal';
import { ProductUomTableRow } from './ProductUomTableRow';

export interface ProductUomsTabProps {
  product: ProductDto;
}

export function ProductUomsTab({ product }: ProductUomsTabProps) {
  const {
    runtime,
    canWrite,
    uomsQuery,
    uoms,
    hasBaseUom,
    togglingIds,
    modal,
    openCreateModal,
    openEditModal,
    closeModal,
    toggleActive,
  } = useProductUomsTab(product);

  const addBtn = (
    <Button
      variant="primary"
      leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
      onClick={openCreateModal}
    >
      Add UOM
    </Button>
  );

  return (
    <Card>
      <CardHeader
        title="UOMs & Pricing"
        description="Authoritative unit conversions and POS sale prices. Deactivate unused units instead of deleting."
        action={canWrite ? addBtn : undefined}
      />
      {!canWrite && (
        <div className="border-border border-b px-4 py-3">
          <Alert variant="info">
            {runtime === 'BranchLocal'
              ? 'UOM changes require the Cloud deployment'
              : 'Read-only access — UOM changes require Admin or Pharmacist inventory write access on Cloud.'}
          </Alert>
        </div>
      )}
      {uomsQuery.isError ? (
        <div className="p-4">
          <Alert variant="danger" title="Could not load units of measure">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                {formatCatalogApiError(
                  uomsQuery.error,
                  'Unable to load units of measure.'
                )}
              </span>
              <Button
                variant="secondary"
                isLoading={uomsQuery.isFetching}
                onClick={() => void uomsQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          </Alert>
        </div>
      ) : uomsQuery.isLoading ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Loading units of measure"
          className="flex flex-col gap-2 p-4"
        >
          {[0, 1, 2].map((r) => (
            <Skeleton key={r} className="h-10 w-full" />
          ))}
        </div>
      ) : uoms.length === 0 ? (
        <EmptyState
          title="No units of measure found"
          description="Add a unit of measure to configure conversions and sale pricing."
          action={canWrite ? addBtn : undefined}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit code</TableHead>
              <TableHead>Display name</TableHead>
              <TableHead>Base unit</TableHead>
              <TableHead numeric>Conversion factor</TableHead>
              <TableHead>Settings</TableHead>
              <TableHead numeric>Sale unit price</TableHead>
              <TableHead>Status</TableHead>
              {canWrite && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {uoms.map((uom) => (
              <ProductUomTableRow
                key={uom.product_uom_id}
                uom={uom}
                canWrite={canWrite}
                isToggling={togglingIds.includes(uom.product_uom_id)}
                onToggleActive={(item, next) => void toggleActive(item, next)}
                onEdit={openEditModal}
              />
            ))}
          </TableBody>
        </Table>
      )}
      <ProductUomFormModal
        open={canWrite && modal.open}
        productId={product.product_id}
        uom={modal.uom}
        hasBaseUom={hasBaseUom}
        onClose={closeModal}
      />
    </Card>
  );
}
