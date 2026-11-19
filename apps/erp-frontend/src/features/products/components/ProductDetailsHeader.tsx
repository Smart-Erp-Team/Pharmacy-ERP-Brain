import { Pencil } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { PageHeading } from '../../../components/ui/PageHeading';
import type { ProductCategoryDto, ProductDto } from '../../../types/api';

export interface ProductDetailsHeaderProps {
  product: ProductDto;
  category: ProductCategoryDto | undefined;
  canWrite: boolean;
  onEditProduct?: (product: ProductDto) => void;
}

export function ProductDetailsHeader({
  product,
  category,
  canWrite,
  onEditProduct,
}: ProductDetailsHeaderProps) {
  return (
    <PageHeading
      eyebrow="Catalog · Product Details"
      title={product.name}
      status={
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="font-mono">{product.sku}</Badge>
          <Badge variant={product.is_active ? 'success' : 'neutral'} dot>
            {product.is_active ? 'Active' : 'Inactive'}
          </Badge>
          <Badge variant={category ? 'info' : 'warning'}>
            {category ? category.name : 'Category unavailable'}
          </Badge>
        </div>
      }
      actions={
        canWrite && onEditProduct ? (
          <Button
            variant="primary"
            leadingIcon={<Pencil className="h-4 w-4" aria-hidden="true" />}
            onClick={() => onEditProduct(product)}
          >
            Edit product
          </Button>
        ) : undefined
      }
    />
  );
}
