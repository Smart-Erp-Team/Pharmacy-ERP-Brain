import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { TableCell, TableRow } from '../../../components/ui/Table';
import type { ProductDto } from '../../products';
import {
  compareDecimalStrings,
  formatNumericDisplay,
  sumDecimalStrings,
} from '../schemas/inventoryAdjustmentSchema';
import {
  StockBalanceBatchTable,
  type StockBalanceBatchItem,
} from './StockBalanceBatchTable';

export interface StockBalanceProductRowProps {
  productId: string;
  product: ProductDto | undefined;
  items: readonly StockBalanceBatchItem[];
  expanded: boolean;
  onToggleExpand: () => void;
}

function summarizeAverageCost(items: readonly StockBalanceBatchItem[]): string {
  const costs = items
    .map((item) => item.balance.average_unit_cost)
    .filter((cost): cost is string => Boolean(cost && cost.trim().length > 0));

  if (costs.length === 0) {
    return 'Unavailable';
  }

  let minCost = costs[0];
  let maxCost = costs[0];
  for (const cost of costs) {
    if (compareDecimalStrings(cost, minCost) < 0) minCost = cost;
    if (compareDecimalStrings(cost, maxCost) > 0) maxCost = cost;
  }

  const formattedMin = formatNumericDisplay(minCost);
  if (compareDecimalStrings(minCost, maxCost) === 0) {
    return formattedMin;
  }
  return `${formattedMin} – ${formatNumericDisplay(maxCost)}`;
}

export function StockBalanceProductRow({
  productId,
  product,
  items,
  expanded,
  onToggleExpand,
}: StockBalanceProductRowProps) {
  const productName = product?.name ?? `Product ${productId.slice(0, 8)}`;
  const totalOnHand = formatNumericDisplay(
    sumDecimalStrings(items.map((item) => item.balance.on_hand_qty_base))
  );
  const totalAvailable = formatNumericDisplay(
    sumDecimalStrings(items.map((item) => item.balance.available_qty_base))
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
                {product?.sku ? (
                  <span className="text-caption text-text-muted font-mono">
                    {product.sku}
                  </span>
                ) : null}
                {product?.base_uom_code ? (
                  <Badge variant="neutral">{product.base_uom_code}</Badge>
                ) : null}
                <span className="text-caption text-text-muted">
                  {items.length} {items.length === 1 ? 'lot' : 'lots'}
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
