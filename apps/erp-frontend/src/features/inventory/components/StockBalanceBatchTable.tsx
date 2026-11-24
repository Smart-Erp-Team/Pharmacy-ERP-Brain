import { Badge, type BadgeVariant } from '../../../components/ui/Badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/Table';
import type {
  BatchQualityStatus,
  InventoryBalanceDto,
  InventoryBatchDto,
  InventoryLocationDto,
  LocationType,
} from '../../../types/api';
import { formatNumericDisplay } from '../schemas/inventoryAdjustmentSchema';

export interface StockBalanceBatchItem {
  balance: InventoryBalanceDto;
  batch: InventoryBatchDto | undefined;
  location: InventoryLocationDto | undefined;
}

export interface StockBalanceBatchTableProps {
  items: readonly StockBalanceBatchItem[];
  expiryAlertDays?: number;
}

const LOCATION_TYPE_VARIANT: Record<LocationType, BadgeVariant> = {
  SELLABLE: 'success',
  QUARANTINE: 'warning',
  SCRAP: 'danger',
};

const QUALITY_VARIANT: Record<BatchQualityStatus, BadgeVariant> = {
  AVAILABLE: 'success',
  QUARANTINED: 'warning',
  EXPIRED: 'danger',
  RECALLED: 'danger',
};

function addUtcDays(days: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)
  )
    .toISOString()
    .slice(0, 10);
}

function compareFefo(
  a: StockBalanceBatchItem,
  b: StockBalanceBatchItem
): number {
  const expA = a.batch?.is_non_lot ? null : (a.batch?.expires_on ?? null);
  const expB = b.batch?.is_non_lot ? null : (b.batch?.expires_on ?? null);
  if (expA && expB) {
    const cmp = expA.localeCompare(expB);
    if (cmp !== 0) return cmp;
  } else if (expA && !expB) {
    return -1;
  } else if (!expA && expB) {
    return 1;
  }
  const batchIdA = a.batch?.batch_id ?? a.balance.batch_id;
  const batchIdB = b.batch?.batch_id ?? b.balance.batch_id;
  return batchIdA.localeCompare(batchIdB);
}

export function StockBalanceBatchTable({
  items,
  expiryAlertDays = 0,
}: StockBalanceBatchTableProps) {
  const todayUtc = addUtcDays(0);
  const alertCutoff = expiryAlertDays > 0 ? addUtcDays(expiryAlertDays) : null;
  const sorted = items.slice().sort(compareFefo);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Location</TableHead>
          <TableHead>Batch</TableHead>
          <TableHead>Manufactured</TableHead>
          <TableHead>Expiry</TableHead>
          <TableHead>Quality</TableHead>
          <TableHead numeric>On-hand</TableHead>
          <TableHead numeric>Available</TableHead>
          <TableHead numeric>Avg cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map(({ balance, batch, location }) => {
          const isNonLot = Boolean(batch?.is_non_lot);
          const expiresOn = isNonLot ? null : (batch?.expires_on ?? null);
          const isExpired = Boolean(expiresOn && expiresOn < todayUtc);
          const isNearing = Boolean(
            !isExpired && expiresOn && alertCutoff && expiresOn <= alertCutoff
          );

          return (
            <TableRow
              key={`${balance.location_id}-${balance.batch_id}`}
              className="bg-surface"
            >
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium">
                    {location?.name ??
                      `Location ${balance.location_id.slice(0, 8)}`}
                  </span>
                  {location ? (
                    <Badge
                      variant={LOCATION_TYPE_VARIANT[location.location_type]}
                    >
                      {location.location_type}
                    </Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono">
                    {batch?.batch_number ?? balance.batch_id.slice(0, 8)}
                  </span>
                  {isNonLot ? <Badge variant="neutral">NON-LOT</Badge> : null}
                </div>
              </TableCell>
              <TableCell>{batch?.manufactured_on ?? 'Unavailable'}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span>{expiresOn ?? 'Unavailable'}</span>
                  {isExpired ? <Badge variant="danger">Expired</Badge> : null}
                  {isNearing ? (
                    <Badge variant="warning">Expiring soon</Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                {batch ? (
                  <Badge variant={QUALITY_VARIANT[batch.quality_status]}>
                    {batch.quality_status}
                  </Badge>
                ) : (
                  'Unavailable'
                )}
              </TableCell>
              <TableCell numeric>
                {formatNumericDisplay(balance.on_hand_qty_base)}
              </TableCell>
              <TableCell numeric>
                {formatNumericDisplay(balance.available_qty_base)}
              </TableCell>
              <TableCell numeric>
                {formatNumericDisplay(balance.average_unit_cost)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
