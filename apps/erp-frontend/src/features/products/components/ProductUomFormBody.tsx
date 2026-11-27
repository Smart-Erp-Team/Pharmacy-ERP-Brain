import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import type { ProductUom } from '../../../types/api';
import { useProductUomForm } from '../hooks/useProductUomForm';
import { ProductUomFormFields } from './ProductUomFormFields';

export interface ProductUomFormBodyProps {
  productId: string;
  uom: ProductUom | null;
  hasBaseUom: boolean;
  onClose: () => void;
}

export function ProductUomFormBody({
  productId,
  uom,
  hasBaseUom,
  onClose,
}: ProductUomFormBodyProps) {
  const {
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
    closeIfIdle,
  } = useProductUomForm(productId, uom, onClose);

  return (
    <Modal
      open
      onClose={closeIfIdle}
      eyebrow="Units of Measure"
      title={uom ? `Edit ${uom.uom_code}` : 'Add UOM'}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={closeIfIdle}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={isPending || (isEdit && !isDirty)}
            isLoading={isPending}
          >
            {isEdit ? 'Save changes' : 'Add UOM'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        {submitError && (
          <Alert
            variant="danger"
            title={isEdit ? 'Could not update UOM' : 'Could not add UOM'}
          >
            {submitError}
          </Alert>
        )}
        <ProductUomFormFields
          uom={uom}
          hasBaseUom={hasBaseUom}
          isPending={isPending}
          isBase={isBase}
          isSellable={isSellable}
          isPurchasable={isPurchasable}
          isActive={isActive}
          errors={errors}
          register={register}
          onToggleBool={setBool}
        />
      </form>
    </Modal>
  );
}
