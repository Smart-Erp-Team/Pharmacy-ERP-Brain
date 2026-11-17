import { CategoryFormModal } from '../components/CategoryFormModal';
import { CreateProductModal } from '../components/CreateProductModal';
import { EditProductModal } from '../components/EditProductModal';
import { ProductDetailsView } from '../components/ProductDetailsView';
import { ProductsCatalogView } from '../components/ProductsCatalogView';
import { useProductsPageState } from '../hooks/useProductsPageState';

/**
 * Product catalog screen: master-detail catalog list + category tree,
 * switching into the 4-tab Product Details view while keeping catalog modals available.
 */
export function ProductsPage() {
  const state = useProductsPageState();
  const selectedProduct = state.selectedProductId
    ? (state.products.find(
        (item) => item.product_id === state.selectedProductId
      ) ?? null)
    : null;

  return (
    <>
      {state.selectedProductId ? (
        <ProductDetailsView
          productId={state.selectedProductId}
          initialProduct={selectedProduct}
          categories={state.categories}
          onBack={() => state.setSelectedProductId(null)}
          onEditProduct={state.openEditProductModal}
        />
      ) : (
        <ProductsCatalogView state={state} />
      )}

      <CategoryFormModal
        open={state.categoryModalState.open}
        category={state.categoryModalState.category}
        categories={state.categories}
        onClose={state.closeCategoryModal}
      />

      <CreateProductModal
        open={state.productModalState.mode === 'create'}
        categories={state.categories}
        isCategoriesError={state.categoriesQuery.isError}
        isRetryingCategories={state.categoriesQuery.isFetching}
        onRetryCategories={() => {
          void state.categoriesQuery.refetch();
        }}
        onClose={state.closeProductModal}
      />

      <EditProductModal
        open={state.productModalState.mode === 'edit'}
        product={state.productModalState.product}
        categories={state.categories}
        isCategoriesError={state.categoriesQuery.isError}
        isRetryingCategories={state.categoriesQuery.isFetching}
        onRetryCategories={() => {
          void state.categoriesQuery.refetch();
        }}
        onClose={state.closeProductModal}
      />
    </>
  );
}
