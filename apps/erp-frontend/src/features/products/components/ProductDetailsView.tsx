import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Tabs } from '../../../components/ui/Tabs';
import { useAuth } from '../../../hooks/useAuth';
import { ApiClientError } from '../../../lib/api/client';
import type { ProductCategoryDto, ProductDto } from '../../../types/api';
import { useProductQuery } from '../hooks/useCatalogQueries';
import { BranchReorderTab } from './BranchReorderTab';
import { ProductDetailsHeader } from './ProductDetailsHeader';
import { ProductForecastTab } from './ProductForecastTab';
import { ProductInfoTab } from './ProductInfoTab';
import { ProductUomsTab } from './ProductUomsTab';

export interface ProductDetailsViewProps {
  productId: string;
  initialProduct?: ProductDto | null;
  categories: readonly ProductCategoryDto[];
  onBack: () => void;
  onEditProduct?: (product: ProductDto) => void;
}

const formatErr = (e: unknown) =>
  e instanceof ApiClientError
    ? e.trace_id
      ? `${e.message} (Trace: ${e.trace_id})`
      : e.message
    : 'Unable to load product details.';

export function ProductDetailsView({
  productId,
  initialProduct,
  categories,
  onBack,
  onEditProduct,
}: ProductDetailsViewProps) {
  const { hasAnyRole, can, runtime } = useAuth();
  const canReadReorder =
    hasAnyRole(['Admin', 'Pharmacist']) && can('inventory:read');
  const canWrite =
    canReadReorder && can('inventory:write') && runtime === 'Cloud';
  const query = useProductQuery(productId);
  const [activeTab, setActiveTab] = useState('Product Information');
  const product =
    query.data ??
    (initialProduct?.product_id === productId ? initialProduct : null);
  const tabs = [
    'Product Information',
    'UOMs & Pricing',
    ...(canReadReorder ? ['Branch Reorder Settings'] : []),
    'AI Demand Forecast',
  ];
  const currentTab = tabs.includes(activeTab)
    ? activeTab
    : 'Product Information';
  const category = product
    ? categories.find((c) => c.category_id === product.category_id)
    : undefined;
  const errorAlert = (variant: 'danger' | 'warning', title: string) => (
    <Alert variant={variant} title={title}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{formatErr(query.error)}</span>
        <Button
          variant="secondary"
          isLoading={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Retry
        </Button>
      </div>
    </Alert>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          variant="secondary"
          leadingIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
          onClick={onBack}
        >
          Back to products
        </Button>
      </div>
      {!product && query.isLoading ? (
        <Card>
          <div
            role="status"
            aria-busy="true"
            aria-label="Loading product details"
            className="flex flex-col gap-4 p-6"
          >
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-32 w-full" />
          </div>
        </Card>
      ) : !product && query.isError ? (
        errorAlert('danger', 'Could not load product')
      ) : !product ? (
        <Card>
          <EmptyState
            title="Product unavailable"
            description="Select a product from the catalog list to view its details."
          />
        </Card>
      ) : (
        <>
          <ProductDetailsHeader
            product={product}
            category={category}
            canWrite={canWrite}
            onEditProduct={onEditProduct}
          />
          {query.isError && errorAlert('warning', 'Could not refresh product')}
          <Tabs
            labels={tabs}
            activeLabel={currentTab}
            onChange={setActiveTab}
          />
          {currentTab === 'Product Information' && (
            <ProductInfoTab product={product} categories={categories} />
          )}
          {currentTab === 'UOMs & Pricing' && (
            <ProductUomsTab key={product.product_id} product={product} />
          )}
          {currentTab === 'Branch Reorder Settings' && (
            <BranchReorderTab key={product.product_id} product={product} />
          )}
          {currentTab === 'AI Demand Forecast' && (
            <ProductForecastTab product={product} />
          )}
        </>
      )}
    </div>
  );
}
