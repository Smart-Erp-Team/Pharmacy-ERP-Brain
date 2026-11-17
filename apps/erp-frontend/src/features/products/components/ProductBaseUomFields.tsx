import {
  Controller,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import { Input } from '../../../components/ui/Input';
import { Toggle } from '../../../components/ui/Toggle';
import type { CreateProductFormValues } from '../schemas/productSchema';

export interface ProductBaseUomFieldsProps {
  disabled: boolean;
  register: UseFormRegister<CreateProductFormValues>;
  control: Control<CreateProductFormValues>;
  errors: FieldErrors<CreateProductFormValues>['base_uom'];
  onSellableChange: (nextSellable: boolean) => void;
}

export function ProductBaseUomFields({
  disabled,
  register,
  control,
  errors,
  onSellableChange,
}: ProductBaseUomFieldsProps) {
  const isSellable = useWatch({
    control,
    name: 'base_uom.is_sellable',
  });

  return (
    <fieldset className="border-border bg-background/50 flex flex-col gap-3 rounded-md border p-4">
      <legend className="text-card-title text-text px-1">
        Base unit of measure
      </legend>
      <p className="text-body-sm text-text-muted -mt-1">
        Created as the product base UOM with conversion factor fixed at 1.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Base UOM code"
          placeholder="tablet"
          maxLength={20}
          disabled={disabled}
          error={errors?.uom_code?.message}
          {...register('base_uom.uom_code')}
        />
        <Input
          label="Display name"
          placeholder="Tablet (base)"
          maxLength={50}
          disabled={disabled}
          error={errors?.display_name?.message}
          {...register('base_uom.display_name')}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Toggle
            label="Sellable"
            description="Allow selling this base unit in POS checkout."
            checked={isSellable}
            onChange={onSellableChange}
            disabled={disabled}
          />
          {errors?.is_sellable?.message ? (
            <p role="alert" className="text-body-sm text-danger font-medium">
              {errors.is_sellable.message}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <Controller
            name="base_uom.is_purchasable"
            control={control}
            render={({ field }) => (
              <Toggle
                label="Purchasable"
                description="Allow ordering this base unit from suppliers."
                checked={field.value}
                onChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          {errors?.is_purchasable?.message ? (
            <p role="alert" className="text-body-sm text-danger font-medium">
              {errors.is_purchasable.message}
            </p>
          ) : null}
        </div>
      </div>

      <Input
        type="text"
        inputMode="decimal"
        label="Sale unit price"
        placeholder="0.00"
        disabled={disabled || !isSellable}
        hint={
          isSellable
            ? 'Required non-negative POS sale price for the base unit.'
            : 'Disabled while Base UOM is not sellable (saved as null).'
        }
        error={errors?.sale_unit_price?.message}
        {...register('base_uom.sale_unit_price')}
      />
    </fieldset>
  );
}
