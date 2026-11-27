import { FolderTree, Plus } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import type { ProductCategory } from '../../../types/api';
import type { CategoryTreeNode as CategoryTreeNodeModel } from '../schemas/categorySchema';
import { CategoryTreeNode } from './CategoryTreeNode';

export interface CategoryTreePanelProps {
  nodes: readonly CategoryTreeNodeModel[];
  selectedCategoryId: string;
  includeInactive: boolean;
  canWriteCatalog: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onSelectCategory: (categoryId: string) => void;
  onAddCategory: () => void;
  onEditCategory: (category: ProductCategory) => void;
}

export function CategoryTreePanel({
  nodes,
  selectedCategoryId,
  includeInactive,
  canWriteCatalog,
  isLoading,
  errorMessage,
  onRetry,
  onSelectCategory,
  onAddCategory,
  onEditCategory,
}: CategoryTreePanelProps) {
  return (
    <Card>
      <CardHeader
        title="Categories"
        description="Click a category to filter products, or click again to clear."
        action={
          canWriteCatalog ? (
            <Button
              variant="secondary"
              leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
              onClick={onAddCategory}
            >
              Add category
            </Button>
          ) : undefined
        }
      />

      {errorMessage ? (
        <div className="p-4">
          <Alert variant="danger" title="Could not load categories">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{errorMessage}</span>
              <Button variant="secondary" onClick={onRetry}>
                Retry
              </Button>
            </div>
          </Alert>
        </div>
      ) : isLoading ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Loading categories"
          className="flex flex-col gap-2 p-4"
        >
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : nodes.length === 0 ? (
        <EmptyState
          icon={<FolderTree className="h-5 w-5" aria-hidden="true" />}
          title={includeInactive ? 'No categories yet' : 'No active categories'}
          description={
            includeInactive
              ? 'Create a category to organize catalog products.'
              : 'Enable inactive items to inspect archived categories, or add a new category.'
          }
          action={
            canWriteCatalog ? (
              <Button variant="primary" onClick={onAddCategory}>
                Add category
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul aria-label="Product categories" className="flex flex-col gap-1 p-3">
          {nodes.map((node) => (
            <CategoryTreeNode
              key={node.category.category_id}
              node={node}
              selectedCategoryId={selectedCategoryId}
              canWriteCatalog={canWriteCatalog}
              onSelectCategory={onSelectCategory}
              onEditCategory={onEditCategory}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
