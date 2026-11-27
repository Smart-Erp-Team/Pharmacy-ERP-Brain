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
import type { Product } from '../../../features/products';
import type { AdjustmentsTxnType, InventoryLocation } from '../../../types/api';
import { buildAdjustmentLineFieldConfigs } from '../hooks/useAdjustmentForm';
import type {
  InventoryAdjustmentFormValues,
  InventoryAdjustmentLineFormValues,
} from '../schemas/inventoryAdjustmentSchema';

export interface AdjustmentLineRowProps {
  index: number;
  totalLines: number;
  transactionType: AdjustmentsTxnType;
  disabled: boolean;
  products: readonly Product[];
  locations: readonly InventoryLocation[];
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
  control,
  lineErrors,
  onProductChange,
  onRemove,
}: AdjustmentLineRowProps) {
  const [productId, uomId, locationId] = useWatch({
    control,
    name: [
      `lines.${index}.product_id`,
      `lines.${index}.product_uom_id`,
      `lines.${index}.location_id`,
    ],
  });

  const { selectFields, inputFields } = buildAdjustmentLineFieldConfigs({
    index,
    transactionType,
    disabled,
    products,
    locations,
    productId,
    uomId,
    locationId,
    lineErrors,
    onProductChange,
  });

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
                name={field.name}
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
                type={item.type}
                inputMode={item.inputMode}
                maxLength={item.maxLength}
                placeholder={item.placeholder}
                required={item.isRequired}
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
