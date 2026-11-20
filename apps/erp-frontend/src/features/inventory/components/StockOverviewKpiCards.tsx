import { AlertTriangle, Boxes, MapPin, Package } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import type {
  InventoryBalanceDto,
  InventoryBatchDto,
  InventoryLocationDto,
} from '../../../types/api';
import {
  compareDecimalStrings,
  formatNumericDisplay,
  sumDecimalStrings,
} from '../schemas/inventoryAdjustmentSchema';

export interface StockOverviewKpiCardsProps {
  balances: readonly InventoryBalanceDto[];
  batches: readonly InventoryBatchDto[];
  locations: readonly InventoryLocationDto[];
  isBalancesLoading: boolean;
  isBalancesError: boolean;
  isBatchesLoading: boolean;
  isBatchesError: boolean;
  isLocationsLoading: boolean;
  isLocationsError: boolean;
}

function getTodayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isBatchFlagged(batch: InventoryBatchDto, todayUtc: string): boolean {
  if (
    batch.quality_status === 'QUARANTINED' ||
    batch.quality_status === 'EXPIRED' ||
    batch.quality_status === 'RECALLED'
  ) {
    return true;
  }
  return Boolean(
    !batch.is_non_lot && batch.expires_on && batch.expires_on < todayUtc
  );
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
  const todayUtc = getTodayUtcDate();

  const activeSkuCount = new Set(
    balances
      .filter((row) => compareDecimalStrings(row.on_hand_qty_base, '0') > 0)
      .map((row) => row.product_id)
  ).size;

  const totalSellableAvailable = formatNumericDisplay(
    sumDecimalStrings(balances.map((row) => row.available_qty_base)),
    { maxDecimals: 4 }
  );

  const flaggedBatchCount = batches.filter((batch) =>
    isBatchFlagged(batch, todayUtc)
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
      helper: 'Quarantined, recalled, or expired lots',
      loading: isBatchesLoading,
      icon: AlertTriangle,
    },
    {
      label: 'Active storage locations',
      value: isLocationsError ? 'Unavailable' : String(activeLocationCount),
      helper: 'Configured shelf, quarantine, & scrap bins',
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
