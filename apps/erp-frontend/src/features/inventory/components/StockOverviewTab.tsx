import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/Table';
import { useStockOverviewData } from '../hooks/useInventoryBranchState';
import { formatNumericDisplay } from '../schemas/inventoryAdjustmentSchema';
import { StockOverviewKpiCards } from './StockOverviewKpiCards';

export interface StockOverviewTabProps {
  branchId: string;
  branchName: string;
}

export function StockOverviewTab({
  branchId,
  branchName,
}: StockOverviewTabProps) {
  const data = useStockOverviewData(branchId);

  return (
    <div className="flex flex-col gap-4">
      <StockOverviewKpiCards
        balances={data.balances}
        batches={data.batches}
        locations={data.locations}
        isBalancesLoading={data.isBalancesLoading}
        isBalancesError={data.isBalancesError}
        isBatchesLoading={data.isBatchesLoading}
        isBatchesError={data.isBatchesError}
        isLocationsLoading={data.isLocationsLoading}
        isLocationsError={data.isLocationsError}
      />

      {data.truncationNotice ? (
        <Alert variant="info" title="Bounded overview sample">
          {data.truncationNotice}
        </Alert>
      ) : null}

      {data.hasProductError && (
        <Alert
          variant="warning"
          title="Some expiry alert rules are unavailable"
        >
          Nearing-expiry results may be incomplete.{' '}
          <Button variant="secondary" onClick={data.retry}>
            Retry product details
          </Button>
        </Alert>
      )}
      <Alert variant="ai" title="Brain Telemetry — Unavailable">
        30-day demand forecast: <strong>Unavailable</strong>. Stockout risk
        score: <strong>Unavailable</strong>. Predictive analytics will appear
        once the Brain telemetry service is connected.
      </Alert>

      <Card>
        <CardHeader
          title="Attention & Flagged Stock"
          description={`Read-only summary of quarantined, recalled, expired, or nearing-expiry lots in ${branchName}.`}
        />
        <div className="p-4">
          {data.isPreviewLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : data.hasPreviewError ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Alert variant="danger" title="Could not load inventory overview">
                Unable to load branch stock balances, locations, batch status,
                or product alert rules.
              </Alert>
              <Button variant="secondary" onClick={data.retry}>
                Retry
              </Button>
            </div>
          ) : data.flaggedRows.length === 0 ? (
            <EmptyState
              title="No flagged stock batches"
              description="No flagged stock was found in the loaded records."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Flag</TableHead>
                  <TableHead numeric>On-hand</TableHead>
                  <TableHead numeric>Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.flaggedRows.map(({ balance, product, reason }) => (
                  <TableRow
                    key={`${balance.product_id}-${balance.location_id}-${balance.batch_id}`}
                  >
                    <TableCell className="font-medium">
                      {product?.name ?? balance.product_name}
                    </TableCell>
                    <TableCell className="font-mono">
                      {balance.batch_number}
                    </TableCell>
                    <TableCell className="font-mono">
                      {balance.location_code}
                    </TableCell>
                    <TableCell>{balance.expires_on ?? 'Unavailable'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          reason === 'Expiring soon' ? 'warning' : 'danger'
                        }
                      >
                        {reason}
                      </Badge>
                    </TableCell>
                    <TableCell numeric>
                      {formatNumericDisplay(balance.on_hand_qty_base)}
                    </TableCell>
                    <TableCell numeric>
                      {formatNumericDisplay(balance.available_qty_base)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
