import { Plus } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { PageHeading } from '../../../components/ui/PageHeading';
import { ApiClientError } from '../../../lib/api/client';
import type { useProductsPageState } from '../hooks/useProductsPageState';
import { CategoryTreePanel } from './CategoryTreePanel';
import { ProductsFilterBar } from './ProductsFilterBar';
import { ProductsTable } from './ProductsTable';

export interface ProductsCatalogViewProps {
  state: ReturnType<typeof useProductsPageState>;
}

function formatQueryError(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    return error.trace_id
      ? `${error.message} (Trace: ${error.trace_id})`
      : error.message;
  }
  return fallback;
}

export function ProductsCatalogView({ state }: ProductsCatalogViewProps) {
  const productsError = state.productsQuery.isError
    ? formatQueryError(state.productsQuery.error, 'Unable to load products.')
    : null;

  const categoriesError = state.categoriesQuery.isError
    ? formatQueryError(
        state.categoriesQuery.error,
        'Unable to load categories.'
      )
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow="Operations"
        title="Products"
        description="Product catalog, units of measure, prices and the category tree."
        actions={
          state.canWriteCatalog ? (
            <Button
              variant="primary"
              leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
              onClick={state.openCreateProductModal}
            >
              Add product
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(350px,1fr)]">
        <Card>
          <CardHeader title="Product list" />
          <ProductsFilterBar
            searchTerm={state.searchTerm}
            selectedCategoryId={state.selectedCategoryId}
            includeInactive={state.includeInactive}
            categories={state.categories}
            hasActiveFilters={state.hasActiveFilters}
            isBranchLocal={state.isBranchLocal}
            onSearchChange={state.handleSearchChange}
            onCategoryChange={state.handleCategoryChange}
            onIncludeInactiveChange={state.handleIncludeInactiveChange}
            onResetFilters={state.resetFilters}
          />
          <ProductsTable
            products={state.products}
            categoryNameById={state.categoryNameById}
            getCategoryName={state.getCategoryName}
            canWriteCatalog={state.canWriteCatalog}
            isLoading={state.productsQuery.isLoading}
            errorMessage={productsError}
            togglingProductIds={state.togglingProductIds}
            hasActiveFilters={state.hasActiveFilters}
            page={state.page}
            pageSize={state.pageSize}
            totalCount={state.totalCount}
            hasNextPage={state.hasNextPage}
            onPageChange={state.handlePageChange}
            onRetry={() => {
              void state.productsQuery.refetch();
            }}
            onResetFilters={state.resetFilters}
            onAddProduct={state.openCreateProductModal}
            onViewProduct={(product) =>
              state.setSelectedProductId(product.product_id)
            }
            onEditProduct={state.openEditProductModal}
            onToggleActive={(product, nextActive) => {
              void state.handleToggleActive(product, nextActive);
            }}
          />
        </Card>

        <CategoryTreePanel
          nodes={state.categoryTree}
          selectedCategoryId={state.selectedCategoryId}
          includeInactive={state.includeInactive}
          canWriteCatalog={state.canWriteCatalog}
          isLoading={state.categoriesQuery.isLoading}
          errorMessage={categoriesError}
          onRetry={() => {
            void state.categoriesQuery.refetch();
          }}
          onSelectCategory={state.handleCategorySelect}
          onAddCategory={state.openCreateCategoryModal}
          onEditCategory={state.openEditCategoryModal}
        />
      </div>
    </div>
  );
}
