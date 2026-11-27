import { useMemo } from 'react';
import { Search } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Toggle } from '../../../components/ui/Toggle';
import { useAuth } from '../../../hooks/useAuth';
import type { ProductCategory } from '../../../types/api';
import { buildProductCategoryOptions } from '../hooks/useProductsPageState';

export interface ProductsFilterBarProps {
  searchTerm: string;
  selectedCategoryId: string;
  includeInactive: boolean;
  categories: readonly ProductCategory[];
  hasActiveFilters: boolean;
  isBranchLocal?: boolean;
  onSearchChange: (value: string) => void;
  onCategoryChange: (categoryId: string) => void;
  onIncludeInactiveChange: (includeInactive: boolean) => void;
  onResetFilters: () => void;
}

export function ProductsFilterBar({
  searchTerm,
  selectedCategoryId,
  includeInactive,
  categories,
  hasActiveFilters,
  isBranchLocal,
  onSearchChange,
  onCategoryChange,
  onIncludeInactiveChange,
  onResetFilters,
}: ProductsFilterBarProps) {
  const { runtime } = useAuth();
  const showBranchLocalNotice = isBranchLocal ?? runtime === 'BranchLocal';

  const categoryOptions = useMemo(
    () =>
      buildProductCategoryOptions(categories, {
        includeInactive,
        emptyLabel: 'All categories',
        currentCategoryId: selectedCategoryId || undefined,
      }),
    [categories, includeInactive, selectedCategoryId]
  );

  return (
    <div className="border-border flex flex-col gap-3 border-b p-4">
      {showBranchLocalNotice ? (
        <Alert variant="info" title="Read-only catalog">
          Catalog changes require the Cloud deployment.
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="flex-1">
          <Input
            label="Search products"
            placeholder="SKU, barcode, or product name"
            leadingIcon={<Search className="h-4 w-4" aria-hidden="true" />}
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>

        <div className="lg:w-60">
          <Select
            label="Category"
            options={categoryOptions}
            value={selectedCategoryId}
            onChange={(event) => onCategoryChange(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 lg:pb-1">
          <Toggle
            label="Include inactive"
            checked={includeInactive}
            onChange={onIncludeInactiveChange}
          />
          {hasActiveFilters ? (
            <Button variant="secondary" onClick={onResetFilters}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
