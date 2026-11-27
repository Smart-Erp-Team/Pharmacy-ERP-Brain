import { useId, useState } from 'react';
import {
  type FieldErrors,
  type Resolver,
  useForm,
  useWatch,
} from 'react-hook-form';
import { toast } from 'react-toastify';
import type { ProductUom } from '../../../types/api';
import {
  useCreateProductUomMutation,
  usePatchProductUomMutation,
} from './useCatalogMutations';
import {
  applyCreateUomFormApiError,
  applyEditUomFormApiError,
} from '../schemas/catalogErrorMapper';
import {
  createUomFormSchema,
  DEFAULT_CREATE_UOM_FORM_VALUES,
  editUomFormSchema,
  toCreateProductUomPayload,
  toPatchProductUomPayload,
  uomDtoToEditFormValues,
  type CreateUomFormValues,
  type EditUomFormValues,
} from '../schemas/uomReorderSchema';

export type UomFormValues = CreateUomFormValues &
  Pick<EditUomFormValues, 'is_active'>;
export type UomBoolField =
  'is_base' | 'is_sellable' | 'is_purchasable' | 'is_active';

const KEYS = [
  'uom_code',
  'display_name',
  'conversion_to_base',
  'is_base',
  'is_sellable',
  'is_purchasable',
  'sale_unit_price',
  'is_active',
] as const;

const uomResolver =
  (isEdit: boolean, isBaseUom = false): Resolver<UomFormValues> =>
  async (values) => {
    const normalizedValues =
      isEdit && isBaseUom
        ? { ...values, is_base: true, conversion_to_base: '1' }
        : values;
    const res = (isEdit ? editUomFormSchema : createUomFormSchema).safeParse(
      normalizedValues
    );
    if (res.success) {
      return { values: { ...normalizedValues, ...res.data }, errors: {} };
    }
    const errors: FieldErrors<UomFormValues> = {};
    for (const issue of res.error.issues) {
      const key = KEYS.find((k) => k === issue.path[0]);
      if (key) errors[key] ??= { type: 'validation', message: issue.message };
    }
    return { values: {}, errors };
  };

const getDefaults = (uom: ProductUom | null): UomFormValues =>
  uom
    ? {
        ...DEFAULT_CREATE_UOM_FORM_VALUES,
        ...uomDtoToEditFormValues(uom),
        uom_code: uom.uom_code,
        conversion_to_base: uom.is_base ? '1' : String(uom.conversion_to_base),
        is_base: uom.is_base,
      }
    : { ...DEFAULT_CREATE_UOM_FORM_VALUES, is_active: true };

export function useProductUomForm(
  productId: string,
  uom: ProductUom | null,
  onClose: () => void
) {
  const isEdit = uom !== null;
  const formId = useId();
  const createMut = useCreateProductUomMutation();
  const patchMut = usePatchProductUomMutation();
  const isPending = createMut.isPending || patchMut.isPending;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    clearErrors,
    setValue,
    formState: { errors, isDirty },
  } = useForm<UomFormValues>({
    resolver: uomResolver(isEdit, uom?.is_base ?? false),
    mode: 'onTouched',
    defaultValues: getDefaults(uom),
  });
  const [isSellable, isPurchasable, isBase, isActive] = useWatch({
    control,
    name: ['is_sellable', 'is_purchasable', 'is_base', 'is_active'],
  });

  const setBool = (name: UomBoolField, next: boolean) => {
    setValue(name, next, { shouldDirty: true, shouldValidate: true });
    if (name === 'is_base' && next) {
      setValue('conversion_to_base', '1', {
        shouldDirty: true,
        shouldValidate: true,
      });
      clearErrors('conversion_to_base');
    } else if (name === 'is_sellable' && !next) {
      setValue('sale_unit_price', '', { shouldDirty: true });
      clearErrors('sale_unit_price');
    } else if (name === 'is_active') {
      clearErrors('is_active');
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    if (isPending || (isEdit && !isDirty)) return;
    setSubmitError(null);
    try {
      await (uom
        ? patchMut.mutateAsync({
            productId,
            uomId: uom.product_uom_id,
            payload: toPatchProductUomPayload(values, uom),
          })
        : createMut.mutateAsync({
            productId,
            payload: toCreateProductUomPayload(values),
          }));
      toast.success(
        uom
          ? `UOM "${uom.uom_code}" updated`
          : `UOM "${values.uom_code.trim()}" added`
      );
      onClose();
    } catch (error) {
      const err = uom
        ? applyEditUomFormApiError(error, setError)
        : applyCreateUomFormApiError(error, setError);
      if (err) {
        setSubmitError(err);
        toast.error(err);
      }
    }
  });

  return {
    isEdit,
    formId,
    isPending,
    isDirty,
    submitError,
    errors,
    isSellable,
    isPurchasable,
    isBase,
    isActive,
    register,
    setBool,
    onSubmit,
    closeIfIdle: () => {
      if (!isPending) onClose();
    },
  };
}
