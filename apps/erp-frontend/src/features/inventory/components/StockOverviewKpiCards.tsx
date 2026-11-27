import { AlertTriangle, Boxes, MapPin, Package } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import type {
  InventoryBatch,
  InventoryLocation,
  StockBalance,
} from '../../../types/api';
import {
  isBatchExpired,
  localDateOffset,
} from '../hooks/useInventoryBranchState';
import { formatNumericDisplay } from '../schemas/inventoryAdjustmentSchema';

export interface StockOverviewKpiCardsProps {
  balances: readonly StockBalance[];
  batches: readonly InventoryBatch[];
  locations: readonly InventoryLocation[];
  isBalancesLoading: boolean;
  isBalancesError: boolean;
  isBatchesLoading: boolean;
  isBatchesError: boolean;
  isLocationsLoading: boolean;
  isLocationsError: boolean;
}

function isBatchFlagged(batch: InventoryBatch, today: string): boolean {
  if (
    batch.quality_status === 'QUARANTINED' ||
    batch.quality_status === 'RECALLED'
  ) {
    return true;
  }
  return isBatchExpired(batch, today);
}

export function StockOverviewKpiCards({
  balances,
  batches,
  locations,
  isBalancesLoading,
  isBalancesError,
  isBatchesLoading,
  isBatchesError,
  isLocationsLoading,
  isLocationsError,
}: StockOverviewKpiCardsProps) {
  const today = localDateOffset(0);

  const activeSkuCount = new Set(
    balances
      .filter((row) => row.on_hand_qty_base > 0)
      .map((row) => row.product_id)
  ).size;

  const totalSellableAvailable = formatNumericDisplay(
    balances.reduce((sum, row) => sum + row.available_qty_base, 0),
    { maxDecimals: 4 }
  );

  const flaggedBatchCount = batches.filter((batch) =>
    isBatchFlagged(batch, today)
  ).length;

  const activeLocationCount = locations.filter((loc) => loc.is_active).length;

  const cards = [
    {
      label: 'Active SKUs with stock',
      value: isBalancesError ? 'Unavailable' : String(activeSkuCount),
      helper: 'Distinct products with on-hand > 0',
      loading: isBalancesLoading,
      icon: Package,
    },
    {
      label: 'Sellable available units',
      value: isBalancesError ? 'Unavailable' : totalSellableAvailable,
      helper: 'Summed base units eligible for sale',
      loading: isBalancesLoading,
      icon: Boxes,
    },
    {
      label: 'Batches flagged',
      value: isBatchesError ? 'Unavailable' : String(flaggedBatchCount),
      helper: 'Quarantined, recalled, or expired org lots',
      loading: isBatchesLoading,
      icon: AlertTriangle,
    },
    {
      label: 'Active storage locations',
      value: isLocationsError ? 'Unavailable' : String(activeLocationCount),
      helper: 'Configured shelf, quarantine, damaged, & scrap bins',
      loading: isLocationsLoading,
      icon: MapPin,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-body-sm text-text-secondary font-semibold">
                {item.label}
              </p>
              <span className="bg-background text-text-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-2">
              {item.loading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <p className="text-title text-text font-semibold tabular-nums">
                  {item.value}
                </p>
              )}
            </div>
            <p className="text-caption text-text-muted mt-1">{item.helper}</p>
          </Card>
        );
      })}
    </div>
  );
}
