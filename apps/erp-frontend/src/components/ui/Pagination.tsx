import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  page: number;
  pageSize: number;
  itemCount?: number | null;
  hasNextPage: boolean;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Result navigation (DESIGN.md §4). The API is cursor based, so the component
 * shows the current window and the previous/next controls; a missing total is
 * reported as "Unavailable" and never as zero (DESIGN.md §8).
 */
export function Pagination({
  page,
  pageSize,
  itemCount,
  hasNextPage,
  onPageChange,
  className = '',
}: PaginationProps) {
  const isFirst = page <= 1;
  const from = (page - 1) * pageSize + 1;
  const to = page * pageSize;
  const totalLabel = typeof itemCount === 'number' ? ` of ${itemCount}` : '';

  return (
    <nav
      aria-label="Pagination"
      className={`flex items-center justify-between gap-3 ${className}`.trim()}
    >
      <p className="text-body-sm text-text-muted">
        {typeof itemCount === 'number'
          ? `Showing ${from}–${to}${totalLabel}`
          : 'Showing results · Total unavailable'}
      </p>

      <div className="flex items-center gap-2">
        <span className="text-body-sm text-text-secondary">Page {page}</span>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={isFirst}
          aria-label="Previous page"
          className="border-border-strong bg-surface text-text hover:bg-background inline-flex h-9 w-9 items-center justify-center rounded-sm border disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNextPage}
          aria-label="Next page"
          className="border-border-strong bg-surface text-text hover:bg-background inline-flex h-9 w-9 items-center justify-center rounded-sm border disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
