import { useMemo } from 'react';
import {
  Controller,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Toggle } from '../../../components/ui/Toggle';
import type { ProductCategoryDto } from '../../../types/api';
import { buildProductCategoryOptions } from '../hooks/useProductsPageState';
import type { CreateProductFormValues } from '../schemas/productSchema';
import { ProductBaseUomFields } from './ProductBaseUomFields';

export interface CreateProductFormFieldsProps {
  categories: readonly ProductCategoryDto[];
  disabled: boolean;
  register: UseFormRegister<CreateProductFormValues>;
  control: Control<CreateProductFormValues>;
  errors: FieldErrors<CreateProductFormValues>;
  onSellableChange: (nextSellable: boolean) => void;
}

export function CreateProductFormFields(props: CreateProductFormFieldsProps) {
  const { categories, disabled, register, control, errors, onSellableChange } =
    props;
  const categoryOptions = useMemo(
    () =>
      buildProductCategoryOptions(categories, {
        emptyLabel: 'Select a category',
      }),
    [categories]
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Category"
          options={categoryOptions}
          disabled={disabled}
          error={errors.category_id?.message}
          {...register('category_id')}
        />
        <Input
          label="SKU"
          placeholder="ANA-PCM-500-TAB"
          maxLength={40}
          disabled={disabled}
          error={errors.sku?.message}
          {...register('sku')}
        />
        <Input
          label="Product name"
          placeholder="Panadol 500mg Tablets"
          maxLength={180}
          disabled={disabled}
          error={errors.name?.message}
          {...register('name')}
        />
        <Input
          label="Barcode (optional)"
          placeholder="6221048001234"
          maxLength={80}
          disabled={disabled}
          error={errors.barcode?.message}
          {...register('barcode')}
        />
        <Input
          label="Generic name (optional)"
          placeholder="Paracetamol 500mg"
          maxLength={180}
          disabled={disabled}
          error={errors.generic_name?.message}
          {...register('generic_name')}
        />
        <Input
          label="Brand name (optional)"
          placeholder="Panadol"
          maxLength={180}
          disabled={disabled}
          error={errors.brand_name?.message}
          {...register('brand_name')}
        />
        <Input
          type="url"
          label="Product image URL (optional)"
          placeholder="https://cdn.pharmaplus.eg/products/item.jpg"
          maxLength={300}
          disabled={disabled}
          error={errors.image_url?.message}
          {...register('image_url')}
        />
        <Input
          type="text"
          inputMode="decimal"
          label="Tax rate (%)"
          placeholder="14"
          hint="Percentage 0–100 (stored as fractional 4dp, e.g. 14 → 0.1400)"
          disabled={disabled}
          error={errors.tax_percent?.message}
          {...register('tax_percent')}
        />
        <Input
          type="text"
          inputMode="numeric"
          label="Expiry alert days"
          placeholder="30"
          hint="Whole days between 0 and 3650"
          disabled={disabled}
          error={errors.expiry_alert_days?.message}
          {...register('expiry_alert_days')}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Controller
          name="lot_tracking_required"
          control={control}
          render={({ field }) => (
            <Toggle
              label="Lot tracking required"
              description="Require batch numbers and expiry dates on stock movements."
              checked={field.value}
              onChange={field.onChange}
              disabled={disabled}
            />
          )}
        />
        {errors.lot_tracking_required?.message ? (
          <p role="alert" className="text-body-sm text-danger font-medium">
            {errors.lot_tracking_required.message}
          </p>
        ) : null}
      </div>
      <ProductBaseUomFields
        disabled={disabled}
        register={register}
        control={control}
        errors={errors.base_uom}
        onSellableChange={onSellableChange}
      />
    </>
  );
}
