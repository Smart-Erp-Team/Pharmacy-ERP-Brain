import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Pagination } from '../../../components/ui/Pagination';
import { Skeleton } from '../../../components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/Table';
import type { Product } from '../../../types/api';
import { ProductTableRow } from './ProductTableRow';
import { ProductsTableEmptyState } from './ProductsTableEmptyState';

export interface ProductsTableProps {
  products: readonly Product[];
  categoryNameById: ReadonlyMap<string, string>;
  getCategoryName?: (categoryId: string) => string;
  canWriteCatalog: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  togglingProductIds: readonly string[];
  hasActiveFilters: boolean;
  page: number;
  pageSize: number;
  totalCount: number | null;
  hasNextPage: boolean;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onResetFilters: () => void;
  onAddProduct: () => void;
  onViewProduct: (product: Product) => void;
  onEditProduct: (product: Product) => void;
  onToggleActive: (product: Product, nextActive: boolean) => void;
}

const COLUMNS = [
  { label: 'Product', numeric: false, skeleton: 'h-4 w-40' },
  { label: 'SKU / Barcode', numeric: false, skeleton: 'h-4 w-28' },
  { label: 'Category', numeric: false, skeleton: 'h-4 w-24' },
  { label: 'Tax', numeric: true, skeleton: 'ml-auto h-4 w-12' },
  { label: 'Base UOM', numeric: false, skeleton: 'h-4 w-20' },
  { label: 'Status', numeric: false, skeleton: 'h-5 w-24' },
  { label: 'Actions', numeric: false, skeleton: 'h-8 w-28' },
] as const;

const HEADERS = (
  <TableHeader>
    <TableRow>
      {COLUMNS.map((col) => (
        <TableHead key={col.label} numeric={col.numeric}>
          {col.label}
        </TableHead>
      ))}
    </TableRow>
  </TableHeader>
);

export function ProductsTable(props: ProductsTableProps) {
  const { products, categoryNameById, getCategoryName, canWriteCatalog } =
    props;
  const { isLoading, errorMessage, togglingProductIds, hasActiveFilters } =
    props;
  const { page, pageSize, totalCount, hasNextPage } = props;

  if (errorMessage) {
    return (
      <div className="p-6">
        <Alert variant="danger" title="Could not load products">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{errorMessage}</span>
            <Button variant="secondary" onClick={props.onRetry}>
              Retry
            </Button>
          </div>
        </Alert>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading products">
        <Table>
          {HEADERS}
          <TableBody>
            {[0, 1, 2, 3].map((row) => (
              <TableRow key={row}>
                {COLUMNS.map((col) => (
                  <TableCell key={col.label} numeric={col.numeric}>
                    <Skeleton className={col.skeleton} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  const showPagination = products.length > 0 || page > 1 || hasNextPage;
  const resolveCategory = (categoryId: string) =>
    getCategoryName
      ? getCategoryName(categoryId)
      : (categoryNameById.get(categoryId) ?? 'Category unavailable');
  return (
    <>
      {products.length === 0 ? (
        <ProductsTableEmptyState
          hasActiveFilters={hasActiveFilters}
          canWriteCatalog={canWriteCatalog}
          onResetFilters={props.onResetFilters}
          onAddProduct={props.onAddProduct}
        />
      ) : (
        <Table>
          {HEADERS}
          <TableBody>
            {products.map((product) => (
              <ProductTableRow
                key={product.product_id}
                product={product}
                categoryName={resolveCategory(product.category_id)}
                canWriteCatalog={canWriteCatalog}
                isToggling={togglingProductIds.includes(product.product_id)}
                onView={props.onViewProduct}
                onEdit={props.onEditProduct}
                onToggleActive={props.onToggleActive}
              />
            ))}
          </TableBody>
        </Table>
      )}
      {showPagination ? (
        <Pagination
          className="border-border border-t px-4 py-3"
          page={page}
          pageSize={pageSize}
          itemCount={totalCount}
          hasNextPage={hasNextPage}
          onPageChange={props.onPageChange}
        />
      ) : null}
    </>
  );
}
