import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { Toggle } from '../../../components/ui/Toggle';
import type { ProductUom } from '../../../types/api';
import type { UomBoolField, UomFormValues } from '../hooks/useProductUomForm';

export interface ProductUomFormFieldsProps {
  uom: ProductUom | null;
  hasBaseUom: boolean;
  isPending: boolean;
  isBase: boolean;
  isSellable: boolean;
  isPurchasable: boolean;
  isActive: boolean;
  errors: FieldErrors<UomFormValues>;
  register: UseFormRegister<UomFormValues>;
  onToggleBool: (field: UomBoolField, next: boolean) => void;
}

const fmtFactor = (value: number): string =>
  Number.isFinite(value) ? String(Number(value.toPrecision(12))) : '—';

export function ProductUomFormFields({
  uom,
  hasBaseUom,
  isPending,
  isBase,
  isSellable,
  isPurchasable,
  isActive,
  errors,
  register,
  onToggleBool,
}: ProductUomFormFieldsProps) {
  const isEdit = uom !== null;
  const conversionField = (
    <Input
      label="Conversion factor"
      type="text"
      inputMode="decimal"
      placeholder="10"
      hint="Conversion factor to base UOM (locked after inventory history exists; base unit is fixed at 1)."
      disabled={isPending || (isEdit ? uom.is_base : isBase)}
      error={errors.conversion_to_base?.message}
      {...register('conversion_to_base')}
    />
  );

  const toggleField = (
    name: UomBoolField,
    label: string,
    checked: boolean,
    disabled: boolean,
    description?: string
  ) => (
    <div key={name} className="flex flex-col gap-1">
      <Toggle
        label={label}
        description={description}
        checked={checked}
        disabled={disabled}
        onChange={(v) => onToggleBool(name, v)}
      />
      {errors[name]?.message && (
        <p role="alert" className="text-body-sm text-danger font-medium">
          {errors[name].message}
        </p>
      )}
    </div>
  );

  return (
    <>
      {uom ? (
        <>
          <div className="border-border bg-background flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
            <div className="flex items-center gap-2">
              <Badge className="font-mono">{uom.uom_code}</Badge>
              <Badge variant={uom.is_base ? 'info' : 'neutral'}>
                {uom.is_base ? 'Base unit' : 'Additional UOM'}
              </Badge>
            </div>
            <span className="text-body-sm text-text-secondary font-mono">
              Factor: {fmtFactor(uom.conversion_to_base)}
            </span>
          </div>
          <Alert variant="info">
            {uom.is_base
              ? 'Base unit conversion factor is fixed at 1 and cannot be deactivated.'
              : 'UOM code and base unit status cannot be changed here. Conversion factor can be updated until this unit is referenced by stock or a posted document.'}
          </Alert>
        </>
      ) : hasBaseUom ? (
        <Alert variant="info">
          Additional UOM (non-base). Product already defines a base unit.
        </Alert>
      ) : (
        toggleField('is_base', 'Base unit', isBase, isPending)
      )}
      {isEdit ? (
        conversionField
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="UOM code"
            placeholder="strip"
            maxLength={20}
            disabled={isPending}
            error={errors.uom_code?.message}
            {...register('uom_code')}
          />
          {conversionField}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Display name"
          placeholder="Strip of 10"
          maxLength={50}
          disabled={isPending}
          error={errors.display_name?.message}
          {...register('display_name')}
        />
        <Input
          label="Sale unit price (EGP)"
          type="text"
          inputMode="decimal"
          placeholder={isSellable ? '12.50' : 'Not sellable'}
          disabled={isPending || !isSellable}
          error={errors.sale_unit_price?.message}
          {...register('sale_unit_price')}
        />
      </div>
      {toggleField('is_sellable', 'Sellable', isSellable, isPending)}
      {toggleField('is_purchasable', 'Purchasable', isPurchasable, isPending)}
      {uom &&
        toggleField(
          'is_active',
          'Active UOM',
          isActive,
          isPending || uom.is_base,
          uom.is_base
            ? 'Base UOM cannot be deactivated.'
            : 'Deactivate instead of deleting historical units.'
        )}
    </>
  );
}
