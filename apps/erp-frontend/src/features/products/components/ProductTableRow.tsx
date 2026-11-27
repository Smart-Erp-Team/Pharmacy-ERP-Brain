import { Eye, Pencil } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { TableCell, TableRow } from '../../../components/ui/Table';
import { Toggle } from '../../../components/ui/Toggle';
import type { Product } from '../../../types/api';
import { formatBaseUomSalePrice } from '../hooks/useProductsPageState';
import { taxRateDtoToPercentString } from '../schemas/productSchema';

export interface ProductTableRowProps {
  product: Product;
  categoryName: string;
  canWriteCatalog: boolean;
  isToggling: boolean;
  onView: (product: Product) => void;
  onEdit: (product: Product) => void;
  onToggleActive: (product: Product, nextActive: boolean) => void;
}

export function ProductTableRow(props: ProductTableRowProps) {
  const { product, categoryName, canWriteCatalog, isToggling } = props;
  const subtitle = [product.generic_name, product.brand_name]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' · ');

  const barcodeText = product.barcode?.trim() ?? '';
  const baseUom = product.uoms.find(
    (uom) => uom.is_base || uom.uom_code === product.base_uom_code
  );
  const basePrice = formatBaseUomSalePrice(baseUom?.sale_unit_price);
  const taxPercent = `${taxRateDtoToPercentString(product.tax_rate)}%`;
  const isUnavailableCategory = categoryName === 'Category unavailable';

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => props.onView(product)}
            className="text-primary focus-visible:ring-primary/40 w-fit rounded-sm text-left font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {product.name}
          </button>
          {subtitle ? (
            <span className="text-body-sm text-text-muted">{subtitle}</span>
          ) : null}
        </div>
      </TableCell>

      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="text-text font-mono font-semibold">
            {product.sku}
          </span>
          <span
            className={
              barcodeText
                ? 'text-body-sm text-text-muted font-mono'
                : 'text-body-sm text-text-muted italic'
            }
          >
            {barcodeText || 'Unavailable'}
          </span>
        </div>
      </TableCell>

      <TableCell
        className={
          isUnavailableCategory
            ? 'text-text-muted italic'
            : 'text-text-secondary'
        }
      >
        {categoryName}
      </TableCell>

      <TableCell numeric className="text-text font-mono">
        {taxPercent}
      </TableCell>

      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="text-text font-mono font-semibold">
            {product.base_uom_code}
          </span>
          {baseUom?.display_name ? (
            <span className="text-body-sm text-text-muted">
              {baseUom.display_name}
            </span>
          ) : null}
          <span
            className={
              basePrice
                ? 'text-body-sm text-text-secondary font-mono'
                : 'text-body-sm text-text-muted italic'
            }
          >
            {basePrice ?? 'Unavailable'}
          </span>
        </div>
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-3">
          <Badge variant={product.is_active ? 'success' : 'neutral'} dot>
            {product.is_active ? 'Active' : 'Inactive'}
          </Badge>
          {canWriteCatalog ? (
            <Toggle
              label={`Toggle status for ${product.name}`}
              checked={product.is_active}
              disabled={isToggling}
              onChange={(nextActive) =>
                props.onToggleActive(product, nextActive)
              }
            />
          ) : null}
        </div>
      </TableCell>

      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            leadingIcon={<Eye className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => props.onView(product)}
          >
            View
          </Button>
          {canWriteCatalog ? (
            <Button
              variant="secondary"
              leadingIcon={
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              }
              onClick={() => props.onEdit(product)}
            >
              Edit
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
