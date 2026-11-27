import { Folder, Pencil } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import type { ProductCategory } from '../../../types/api';
import type { CategoryTreeNode as CategoryTreeNodeModel } from '../schemas/categorySchema';

export interface CategoryTreeNodeProps {
  node: CategoryTreeNodeModel;
  selectedCategoryId: string;
  canWriteCatalog: boolean;
  onSelectCategory: (categoryId: string) => void;
  onEditCategory: (category: ProductCategory) => void;
}

const DEPTH_INDENT_CLASSES: Record<number, string> = {
  0: 'pl-0',
  1: 'pl-4',
  2: 'pl-8',
  3: 'pl-12',
};

export function CategoryTreeNode({
  node,
  selectedCategoryId,
  canWriteCatalog,
  onSelectCategory,
  onEditCategory,
}: CategoryTreeNodeProps) {
  const { category, children, depth } = node;
  const clampedDepth = Math.max(0, Math.min(depth, 3));
  const indentClass = DEPTH_INDENT_CLASSES[clampedDepth] ?? 'pl-12';
  const isSelected = selectedCategoryId === category.category_id;

  return (
    <li>
      <div className={indentClass} data-depth={clampedDepth}>
        <div
          className={`flex items-start justify-between gap-2 rounded-sm border px-2.5 py-2 transition-colors ${
            isSelected
              ? 'border-primary/30 bg-primary-soft'
              : 'hover:bg-background border-transparent'
          }`}
        >
          <button
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelectCategory(category.category_id)}
            className="focus-visible:ring-primary/40 flex min-w-0 flex-1 items-start gap-2 rounded-sm text-left focus-visible:ring-2 focus-visible:outline-none"
          >
            <Folder
              className={`mt-0.5 h-4 w-4 shrink-0 ${
                isSelected ? 'text-primary' : 'text-text-muted'
              }`}
              aria-hidden="true"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-body text-text font-semibold">
                  {category.name}
                </span>
                <span className="text-body-sm text-text-secondary font-mono">
                  {category.code}
                </span>
                {!category.is_active ? (
                  <Badge variant="neutral">Inactive</Badge>
                ) : null}
              </span>
              {category.description ? (
                <span className="text-body-sm text-text-muted">
                  {category.description}
                </span>
              ) : null}
            </span>
          </button>

          {canWriteCatalog ? (
            <Button
              variant="ghost"
              aria-label={`Edit ${category.name}`}
              onClick={() => onEditCategory(category)}
              className="h-9 w-9 shrink-0 px-0"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>

      {children.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1">
          {children.map((child) => (
            <CategoryTreeNode
              key={child.category.category_id}
              node={child}
              selectedCategoryId={selectedCategoryId}
              canWriteCatalog={canWriteCatalog}
              onSelectCategory={onSelectCategory}
              onEditCategory={onEditCategory}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
