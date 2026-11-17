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
import {
  buildProductCategoryOptions,
  EDIT_PRODUCT_TEXT_FIELDS,
} from '../hooks/useProductsPageState';
import type { EditProductFormValues } from '../schemas/productSchema';

export interface EditProductFormFieldsProps {
  sku: string;
  baseUomCode: string;
  currentCategoryId: string;
  categories: readonly ProductCategoryDto[];
  disabled: boolean;
  register: UseFormRegister<EditProductFormValues>;
  control: Control<EditProductFormValues>;
  errors: FieldErrors<EditProductFormValues>;
}

const TOGGLE_FIELDS = [
  {
    name: 'lot_tracking_required',
    label: 'Lot tracking required',
    description: 'Locked once stock or posted ledger history exists.',
  },
  {
    name: 'is_active',
    label: 'Active product',
    description: 'Inactive products are hidden from active POS lookups.',
  },
] as const;

export function EditProductFormFields(props: EditProductFormFieldsProps) {
  const { sku, baseUomCode, currentCategoryId, categories } = props;
  const { disabled, register, control, errors } = props;
  const categoryOptions = useMemo(
    () =>
      buildProductCategoryOptions(categories, {
        emptyLabel: 'Select a category',
        currentCategoryId,
      }),
    [categories, currentCategoryId]
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="SKU"
          value={sku}
          disabled
          readOnly
          hint="SKU is immutable once created."
        />
        <Input
          label="Base UOM"
          value={baseUomCode}
          disabled
          readOnly
          hint="Base UOM code is immutable; manage units in UOMs & Pricing."
        />
        <Select
          label="Category"
          options={categoryOptions}
          disabled={disabled}
          error={errors.category_id?.message}
          {...register('category_id')}
        />
        {EDIT_PRODUCT_TEXT_FIELDS.map((field) => (
          <Input
            key={field.name}
            type={field.type}
            inputMode={'inputMode' in field ? field.inputMode : undefined}
            label={field.label}
            placeholder={field.placeholder}
            maxLength={'maxLength' in field ? field.maxLength : undefined}
            hint={'hint' in field ? field.hint : undefined}
            disabled={disabled}
            error={errors[field.name]?.message}
            {...register(field.name)}
          />
        ))}
      </div>
      {TOGGLE_FIELDS.map((item) => {
        const fieldError = errors[item.name]?.message;
        return (
          <div key={item.name} className="flex flex-col gap-1.5">
            <Controller
              name={item.name}
              control={control}
              render={({ field }) => (
                <Toggle
                  label={item.label}
                  description={item.description}
                  checked={field.value}
                  onChange={field.onChange}
                  disabled={disabled}
                />
              )}
            />
            {fieldError ? (
              <p role="alert" className="text-body-sm text-danger font-medium">
                {fieldError}
              </p>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
