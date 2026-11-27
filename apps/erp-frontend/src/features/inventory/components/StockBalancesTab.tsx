import { Search } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Input } from '../../../components/ui/Input';
import { Pagination } from '../../../components/ui/Pagination';
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
  BALANCE_EXPIRY_OPTIONS,
  BALANCE_LOCATION_OPTIONS,
  parseExpiryFilter,
  parseLocationFilter,
  useStockBalancesState,
} from '../hooks/useInventoryBranchState';
import { StockBalanceProductRow } from './StockBalanceProductRow';

export interface StockBalancesTabProps {
  branchId: string;
}

export function StockBalancesTab({ branchId }: StockBalancesTabProps) {
  const state = useStockBalancesState(branchId);

  return (
    <Card>
      <CardHeader
        title="Stock Balances & FEFO Batches"
        description="Read-only projection grouped by product. Expand a row to inspect batches sorted by earliest expiry (FEFO), with NON-LOT last."
      />
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <Input
            label="Search products"
            placeholder="Name, SKU, barcode, or batch"
            leadingIcon={<Search className="h-4 w-4" aria-hidden="true" />}
            value={state.search}
            onChange={(e) => state.setSearch(e.target.value)}
          />
          <Select
            label="Location type"
            options={BALANCE_LOCATION_OPTIONS}
            value={state.locationType}
            onChange={(e) =>
              state.setLocationType(parseLocationFilter(e.target.value))
            }
          />
          <Select
            label="Storage location"
            options={state.locationOptions}
            value={state.locationId}
            onChange={(e) => state.setLocationId(e.target.value)}
          />
          <Select
            label="Expiry status"
            options={BALANCE_EXPIRY_OPTIONS}
            value={state.expiryFilter}
            onChange={(e) =>
              state.setExpiryFilter(parseExpiryFilter(e.target.value))
            }
          />
          <Button
            variant="secondary"
            onClick={state.clearFilters}
            disabled={!state.hasFilters}
          >
            Clear filters
          </Button>
        </div>

        {!state.isLoading && !state.isError && state.isMultiPage ? (
          <p className="text-caption text-text-muted">
            Search, location type, and expiry status filter the current page (
            {state.pageItemCount} of {state.totalCount} records). Select a
            storage location to filter on the server.
          </p>
        ) : null}

        {state.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : state.isError ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Alert variant="danger" title="Could not load stock balances">
              Unable to retrieve balances, locations, or product details for
              this branch.
            </Alert>
            <Button variant="secondary" onClick={state.retry}>
              Retry
            </Button>
          </div>
        ) : state.groupedProducts.length === 0 ? (
          <>
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
            {state.showPagination ? (
              <Pagination {...state.paginationProps} />
            ) : null}
          </>
        ) : (
          <>
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
            <Pagination {...state.paginationProps} />
          </>
        )}
      </div>
    </Card>
  );
}
