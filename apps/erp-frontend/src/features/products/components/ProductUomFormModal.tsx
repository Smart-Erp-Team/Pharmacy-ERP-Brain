import type { ProductUomDto } from '../../../types/api';
import { ProductUomFormBody } from './ProductUomFormBody';

export interface ProductUomFormModalProps {
  open: boolean;
  productId: string;
  uom: ProductUomDto | null;
  hasBaseUom?: boolean;
  onClose: () => void;
}

export function ProductUomFormModal({
  open,
  productId,
  uom,
  hasBaseUom = true,
  onClose,
}: ProductUomFormModalProps) {
  if (!open) return null;
  return (
    <ProductUomFormBody
      key={uom?.product_uom_id ?? 'new-uom'}
      productId={productId}
      uom={uom}
      hasBaseUom={hasBaseUom}
      onClose={onClose}
    />
  );
}
