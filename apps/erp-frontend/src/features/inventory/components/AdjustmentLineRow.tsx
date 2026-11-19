import { Trash2 } from 'lucide-react';
import {
  Controller,
  useWatch,
  type Control,
  type FieldErrors,
} from 'react-hook-form';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import {
  useProductUomsQuery,
  type ProductDto,
} from '../../../features/products';
import type {
  AdjustmentsTxnType,
  InventoryBatchDto,
  InventoryLocationDto,
} from '../../../types/api';
import { buildAdjustmentLineSelectConfigs } from '../hooks/useAdjustmentForm';
import type {
  InventoryAdjustmentFormValues,
  InventoryAdjustmentLineFormValues,
} from '../schemas/inventoryAdjustmentSchema';

export interface AdjustmentLineRowProps {
  index: number;
  totalLines: number;
  transactionType: AdjustmentsTxnType;
  disabled: boolean;
  products: readonly ProductDto[];
  locations: readonly InventoryLocationDto[];
  batches: readonly InventoryBatchDto[];
  control: Control<InventoryAdjustmentFormValues>;
  lineErrors?: FieldErrors<InventoryAdjustmentLineFormValues>;
  onProductChange: (index: number, productId: string) => void;
  onRemove: (index: number) => void;
}

export function AdjustmentLineRow({
  index,
  totalLines,
  transactionType,
  disabled,
  products,
  locations,
  batches,
  control,
  lineErrors,
  onProductChange,
  onRemove,
}: AdjustmentLineRowProps) {
  const [productId, locationId, batchId, uomId] = useWatch({
    control,
    name: [
      `lines.${index}.product_id`,
      `lines.${index}.location_id`,
      `lines.${index}.batch_id`,
      `lines.${index}.product_uom_id`,
    ],
  });

  const selectedProduct = products.find((p) => p.product_id === productId);
  const isNonLot = selectedProduct?.lot_tracking_required === false;
  const uomsQuery = useProductUomsQuery(productId || undefined, {
    enabled: Boolean(productId),
  });
  const uoms =
    uomsQuery.data && uomsQuery.data.length > 0
      ? uomsQuery.data
      : (selectedProduct?.uoms ?? []);

  const selectFields = buildAdjustmentLineSelectConfigs({
    index,
    disabled,
    products,
    locations,
    batches,
    uoms,
    productId,
    locationId,
    batchId,
    uomId,
    isNonLot,
    lineErrors,
    onProductChange,
  });

  const requiresCost =
    transactionType === 'OPENING_BALANCE' ||
    transactionType === 'ADJUSTMENT_IN';

  const inputFields = [
    {
      name: `lines.${index}.entered_qty` as const,
      label: 'Quantity',
      placeholder: 'e.g. 10',
      isDisabled: disabled,
      hint: selectedProduct
        ? `Entered in selected UOM (base: ${selectedProduct.base_uom_code})`
        : undefined,
      error: lineErrors?.entered_qty?.message,
    },
    {
      name: `lines.${index}.unit_cost_base` as const,
      label: 'Unit cost (base)',
      placeholder: requiresCost ? '0.00' : 'Not used',
      isDisabled: disabled || !requiresCost,
      hint: requiresCost
        ? 'Required non-negative cost per base unit'
        : 'Cleared and disabled for outbound or reversal entries',
      error: lineErrors?.unit_cost_base?.message,
    },
  ];

  return (
    <div
      role="group"
      aria-label={`Adjustment line ${index + 1}`}
      className="border-border bg-background/50 flex flex-col gap-3 rounded-md border p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-body text-text font-semibold">
          Line {index + 1}
        </span>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || totalLines <= 1}
          aria-label={`Remove line ${index + 1}`}
          leadingIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
          onClick={() => onRemove(index)}
        >
          Remove
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {selectFields.map((item) => (
          <Controller
            key={item.name}
            name={item.name}
            control={control}
            render={({ field }) => (
              <Select
                label={item.label}
                options={item.options}
                value={field.value}
                onBlur={field.onBlur}
                onChange={(e) =>
                  item.onValueChange
                    ? item.onValueChange(e.target.value)
                    : field.onChange(e.target.value)
                }
                disabled={item.isDisabled}
                hint={item.hint}
                error={item.error}
              />
            )}
          />
        ))}
        {inputFields.map((item) => (
          <Controller
            key={item.name}
            name={item.name}
            control={control}
            render={({ field }) => (
              <Input
                label={item.label}
                name={field.name}
                type="text"
                inputMode="decimal"
                placeholder={item.placeholder}
                value={field.value}
                onBlur={field.onBlur}
                onChange={(e) => field.onChange(e.target.value)}
                disabled={item.isDisabled}
                hint={item.hint}
                error={item.error}
              />
            )}
          />
        ))}
      </div>
    </div>
  );
}
