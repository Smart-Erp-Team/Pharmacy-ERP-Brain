import { Package } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';

export interface ProductsTableEmptyStateProps {
  hasActiveFilters: boolean;
  canWriteCatalog: boolean;
  onResetFilters: () => void;
  onAddProduct: () => void;
}

export function ProductsTableEmptyState({
  hasActiveFilters,
  canWriteCatalog,
  onResetFilters,
  onAddProduct,
}: ProductsTableEmptyStateProps) {
  if (hasActiveFilters) {
    return (
      <EmptyState
        icon={<Package className="h-5 w-5" aria-hidden="true" />}
        title="No products match your filters"
        description="Try clearing your search term, selecting all categories, or including inactive products."
        action={
          <Button variant="secondary" onClick={onResetFilters}>
            Clear filters
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={<Package className="h-5 w-5" aria-hidden="true" />}
      title="No products yet"
      description={
        canWriteCatalog
          ? 'Add your first catalog product with its tax rate, tracking flags, and base unit of measure.'
          : 'No active catalog products are available right now.'
      }
      action={
        canWriteCatalog ? (
          <Button variant="primary" onClick={onAddProduct}>
            Add product
          </Button>
        ) : undefined
      }
    />
  );
}
