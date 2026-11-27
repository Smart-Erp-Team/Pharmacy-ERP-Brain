import { ChevronDown, ChevronRight } from 'lucide-react';
import { useInventorySummaryQuery } from '../hooks/useInventoryQueries';
import { Badge } from '../../../components/ui/Badge';
import { TableCell, TableRow } from '../../../components/ui/Table';
import type { Product } from '../../products';
import { formatNumericDisplay } from '../schemas/inventoryAdjustmentSchema';
import {
  StockBalanceBatchTable,
  type StockBalanceBatchItem,
} from './StockBalanceBatchTable';

export interface StockBalanceProductRowProps {
  productId: string;
  product: Product | undefined;
  items: readonly StockBalanceBatchItem[];
  expanded: boolean;
  onToggleExpand: () => void;
}

function summarizeAverageCost(items: readonly StockBalanceBatchItem[]): string {
  let weightedSum = 0;
  let totalQty = 0;
  let minCost: number | null = null;
  let maxCost: number | null = null;

  for (const { balance } of items) {
    const cost = balance.average_unit_cost;
    if (cost === null || !Number.isFinite(cost)) continue;
    minCost = minCost === null ? cost : Math.min(minCost, cost);
    maxCost = maxCost === null ? cost : Math.max(maxCost, cost);
    if (balance.on_hand_qty_base > 0) {
      weightedSum += cost * balance.on_hand_qty_base;
      totalQty += balance.on_hand_qty_base;
    }
  }

  if (minCost === null || maxCost === null) {
    return 'Unavailable';
  }
  if (totalQty > 0) {
    return formatNumericDisplay(weightedSum / totalQty, { maxDecimals: 4 });
  }
  const formattedMin = formatNumericDisplay(minCost);
  return minCost === maxCost
    ? formattedMin
    : `${formattedMin} – ${formatNumericDisplay(maxCost)}`;
}

export function StockBalanceProductRow({
  productId,
  product,
  items,
  expanded,
  onToggleExpand,
}: StockBalanceProductRowProps) {
  const firstBalance = items[0]?.balance;
  const summary = useInventorySummaryQuery(
    {
      branch_id: firstBalance?.branch_id ?? '',
      product_id: productId,
    },
    { enabled: expanded }
  );
  const productName =
    product?.name ??
    firstBalance?.product_name ??
    `Product ${productId.slice(0, 8)}`;
  const productSku = product?.sku ?? firstBalance?.product_sku;
  const baseUomCode = product?.base_uom_code ?? firstBalance?.base_uom_code;

  const totalOnHand = formatNumericDisplay(
    items.reduce((sum, item) => sum + item.balance.on_hand_qty_base, 0)
  );
  const totalAvailable = formatNumericDisplay(
    items.reduce((sum, item) => sum + item.balance.available_qty_base, 0)
  );
  const averageCostSummary = summarizeAverageCost(items);

  return (
    <>
      <TableRow>
        <TableCell>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={expanded}
              aria-label={`Toggle batch breakdown for ${productName}`}
              className="text-text-muted hover:text-text hover:bg-background inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm"
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">{productName}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {productSku ? (
                  <span className="text-caption text-text-muted font-mono">
                    {productSku}
                  </span>
                ) : null}
                {baseUomCode ? (
                  <Badge variant="neutral">{baseUomCode}</Badge>
                ) : null}
                <span className="text-caption text-text-muted">
                  {items.length}{' '}
                  {items.length === 1 ? 'balance row' : 'balance rows'}
                </span>
              </div>
            </div>
          </div>
        </TableCell>
        <TableCell numeric className="font-semibold tabular-nums">
          {totalOnHand}
        </TableCell>
        <TableCell numeric className="font-semibold tabular-nums">
          {totalAvailable}
        </TableCell>
        <TableCell numeric className="tabular-nums">
          {averageCostSummary}
        </TableCell>
      </TableRow>
      {expanded ? (
        <tr className="border-border bg-background/60 border-b">
          <td colSpan={4} className="px-4 py-3">
            <div className="mb-3" aria-label="Branch totals">
              {summary.data ? (
                <p>
                  Branch totals across all locations and lots. On-hand{' '}
                  {formatNumericDisplay(summary.data.total_on_hand_qty_base)},
                  available{' '}
                  {formatNumericDisplay(summary.data.total_available_qty_base)},
                  weighted average cost{' '}
                  {formatNumericDisplay(
                    summary.data.weighted_average_unit_cost_base
                  )}
                  .
                </p>
              ) : summary.isError ? (
                <button type="button" onClick={() => void summary.refetch()}>
                  Retry branch totals
                </button>
              ) : (
                'Loading branch totals…'
              )}
            </div>
            <StockBalanceBatchTable
              items={items}
              expiryAlertDays={product?.expiry_alert_days}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}
