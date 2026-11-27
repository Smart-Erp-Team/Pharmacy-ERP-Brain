import { Badge } from '../../../components/ui/Badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/Table';
import {
  BATCH_QUALITY_BADGE_VARIANT,
  isNonLotBatchNumber,
  LOCATION_TYPE_BADGE_VARIANT,
  sortBalancesFefo,
  utcDateOffset,
  type GroupedBalanceItem,
} from '../hooks/useInventoryBranchState';
import { formatNumericDisplay } from '../schemas/inventoryAdjustmentSchema';

export type StockBalanceBatchItem = GroupedBalanceItem;

export interface StockBalanceBatchTableProps {
  items: readonly StockBalanceBatchItem[];
  expiryAlertDays?: number;
}

export function StockBalanceBatchTable({
  items,
  expiryAlertDays = 0,
}: StockBalanceBatchTableProps) {
  const todayUtc = utcDateOffset(0);
  const alertCutoff =
    expiryAlertDays > 0 ? utcDateOffset(expiryAlertDays) : null;
  const sorted = sortBalancesFefo(items);

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
          const isNonLot = isNonLotBatchNumber(balance.batch_number);
          const expiresOn = isNonLot
            ? null
            : (balance.expires_on ?? batch?.expires_on ?? null);
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
                    {location?.name ?? balance.location_code}
                  </span>
                  <span className="text-caption text-text-muted font-mono">
                    {balance.location_code}
                  </span>
                  <Badge
                    variant={LOCATION_TYPE_BADGE_VARIANT[balance.location_type]}
                  >
                    {balance.location_type}
                  </Badge>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono">{balance.batch_number}</span>
                  {isNonLot ? <Badge variant="neutral">NON-LOT</Badge> : null}
                  <span className="text-caption text-text-muted tabular-nums">
                    v{balance.row_version}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {balance.manufactured_on ??
                  batch?.manufactured_on ??
                  'Unavailable'}
              </TableCell>
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
                <Badge
                  variant={BATCH_QUALITY_BADGE_VARIANT[balance.quality_status]}
                >
                  {balance.quality_status}
                </Badge>
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
