import { Eye, Pencil } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { TableCell, TableRow } from '../../../components/ui/Table';
import { Toggle } from '../../../components/ui/Toggle';
import type { ProductDto } from '../../../types/api';
import { taxRateDtoToPercentString } from '../schemas/productSchema';

export interface ProductTableRowProps {
  product: ProductDto;
  categoryName: string;
  canWriteCatalog: boolean;
  isToggling: boolean;
  onView: (product: ProductDto) => void;
  onEdit: (product: ProductDto) => void;
  onToggleActive: (product: ProductDto, nextActive: boolean) => void;
}

export function ProductTableRow({
  product,
  categoryName,
  canWriteCatalog,
  isToggling,
  onView,
  onEdit,
  onToggleActive,
}: ProductTableRowProps) {
  const subtitle = [product.generic_name, product.brand_name]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' · ');

  const barcodeText = product.barcode?.trim() ?? '';
  const baseUom = product.uoms?.find(
    (uom) => uom.is_base || uom.uom_code === product.base_uom_code
  );
  const taxPercent = `${taxRateDtoToPercentString(product.tax_rate)}%`;
  const isUnavailableCategory = categoryName === 'Category unavailable';

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onView(product)}
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
          {barcodeText ? (
            <span className="text-body-sm text-text-muted font-mono">
              {barcodeText}
            </span>
          ) : (
            <span className="text-body-sm text-text-muted italic">
              Unavailable
            </span>
          )}
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
              onChange={(nextActive) => onToggleActive(product, nextActive)}
            />
          ) : null}
        </div>
      </TableCell>

      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            leadingIcon={<Eye className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => onView(product)}
          >
            View
          </Button>
          {canWriteCatalog ? (
            <Button
              variant="secondary"
              leadingIcon={
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              }
              onClick={() => onEdit(product)}
            >
              Edit
            </Button>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
