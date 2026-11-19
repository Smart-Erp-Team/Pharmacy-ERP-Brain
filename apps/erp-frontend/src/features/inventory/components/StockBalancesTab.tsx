import { Search } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Skeleton } from '../../../components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/Table';
import {
  useStockBalancesState,
  type ExpiryFilter,
  type LocationFilter,
} from '../hooks/useInventoryBranchState';
import { StockBalanceProductRow } from './StockBalanceProductRow';

export interface StockBalancesTabProps {
  branchId: string;
}

const LOCATION_OPTIONS = [
  { value: 'ALL', label: 'All location types' },
  { value: 'SELLABLE', label: 'SELLABLE' },
  { value: 'QUARANTINE', label: 'QUARANTINE' },
  { value: 'SCRAP', label: 'SCRAP' },
] as const;

const EXPIRY_OPTIONS = [
  { value: 'ALL', label: 'All expiry statuses' },
  { value: 'NEARING_EXPIRY', label: 'Nearing expiry' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'NON_LOT', label: 'NON-LOT' },
] as const;

export function StockBalancesTab({ branchId }: StockBalancesTabProps) {
  const state = useStockBalancesState(branchId);

  return (
    <Card>
      <CardHeader
        title="Stock Balances & FEFO Batches"
        description="Read-only projection grouped by product. Expand a row to inspect batches sorted by earliest expiry (FEFO), with NON-LOT last."
      />
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4 md:items-end">
          <Input
            label="Search products"
            placeholder="Name, SKU, or barcode"
            leadingIcon={<Search className="h-4 w-4" aria-hidden="true" />}
            value={state.search}
            onChange={(e) => state.setSearch(e.target.value)}
          />
          <Select
            label="Location type"
            options={LOCATION_OPTIONS}
            value={state.locationType}
            onChange={(e) =>
              state.setLocationType(e.target.value as LocationFilter)
            }
          />
          <Select
            label="Expiry status"
            options={EXPIRY_OPTIONS}
            value={state.expiryFilter}
            onChange={(e) =>
              state.setExpiryFilter(e.target.value as ExpiryFilter)
            }
          />
          <div>
            <Button
              variant="secondary"
              onClick={state.clearFilters}
              disabled={!state.hasFilters}
            >
              Clear filters
            </Button>
          </div>
        </div>

        {state.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : state.isError ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Alert variant="danger" title="Could not load stock balances">
              Unable to retrieve balances or batch details for this branch.
            </Alert>
            <Button variant="secondary" onClick={state.retry}>
              Retry
            </Button>
          </div>
        ) : state.groupedProducts.length === 0 ? (
          <EmptyState
            title="No matching stock balances"
            description={
              state.hasFilters
                ? 'Try adjusting or clearing your search and filter criteria.'
                : 'No stock balances are recorded in this branch yet.'
            }
            action={
              state.hasFilters ? (
                <Button variant="secondary" onClick={state.clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead numeric>On-hand (base)</TableHead>
                <TableHead numeric>Available (base)</TableHead>
                <TableHead numeric>Avg unit cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.groupedProducts.map(([productId, group]) => (
                <StockBalanceProductRow
                  key={productId}
                  productId={productId}
                  product={group.product}
                  items={group.items}
                  expanded={state.expandedIds.includes(productId)}
                  onToggleExpand={() => state.toggleExpand(productId)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </Card>
  );
}
