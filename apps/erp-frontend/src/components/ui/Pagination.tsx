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
 * Result navigation (DESIGN.md §4) aligned with Stage 1 page-based
 * `PagedResult<T>` (`page`, `page_size`, `total_count`). Displays the current
 * result window (`from–to of itemCount`) when `total_count` is supplied,
 * `Showing 0 of 0` for explicit zero totals, and "Total unavailable" when
 * `itemCount` is omitted or null — never substituting unavailable with zero
 * (DESIGN.md §8).
 */
export function Pagination({
  page,
  pageSize,
  itemCount,
  hasNextPage,
  onPageChange,
  className = '',
}: PaginationProps) {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const isFirst = safePage <= 1;
  const from = (safePage - 1) * safePageSize + 1;
  const hasValidTotal =
    typeof itemCount === 'number' &&
    Number.isFinite(itemCount) &&
    itemCount >= 0;
  const to = hasValidTotal
    ? Math.min(safePage * safePageSize, itemCount)
    : safePage * safePageSize;

  let summaryText = 'Showing results · Total unavailable';
  if (hasValidTotal && itemCount === 0) {
    summaryText = 'Showing 0 of 0';
  } else if (hasValidTotal) {
    summaryText =
      from > itemCount
        ? `Showing 0 of ${itemCount}`
        : `Showing ${from}–${to} of ${itemCount}`;
  }

  return (
    <nav
      aria-label="Pagination"
      className={`flex items-center justify-between gap-3 ${className}`.trim()}
    >
      <p className="text-body-sm text-text-muted">{summaryText}</p>

      <div className="flex items-center gap-2">
        <span className="text-body-sm text-text-secondary">
          Page {safePage}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={isFirst}
          aria-label="Previous page"
          className="border-border-strong bg-surface text-text hover:bg-background inline-flex h-9 w-9 items-center justify-center rounded-sm border disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
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
