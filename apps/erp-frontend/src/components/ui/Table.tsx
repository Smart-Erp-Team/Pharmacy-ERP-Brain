import type { ReactNode } from 'react';
import { ArrowUpDown } from 'lucide-react';

export type SortDirection = 'ascending' | 'descending' | 'none';

export interface TableProps {
  children: ReactNode;
  className?: string;
}

/**
 * Table shell with horizontal overflow (DESIGN.md §3.4 and §4).
 */
export function Table({ children, className = '' }: TableProps) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={`w-full border-collapse ${className}`.trim()}>
        {children}
      </table>
    </div>
  );
}

export interface TableSectionProps {
  children: ReactNode;
  className?: string;
}

export function TableHeader({ children, className = '' }: TableSectionProps) {
  return (
    <thead className={`bg-background ${className}`.trim()}>{children}</thead>
  );
}

export function TableBody({ children, className = '' }: TableSectionProps) {
  return <tbody className={className}>{children}</tbody>;
}

export function TableRow({ children, className = '' }: TableSectionProps) {
  return (
    <tr
      className={`border-border hover:bg-background border-b last:border-0 ${className}`.trim()}
    >
      {children}
    </tr>
  );
}

export interface TableHeadProps extends TableSectionProps {
  numeric?: boolean;
  sortDirection?: SortDirection;
  onSort?: () => void;
}

/**
 * Column header: 8px uppercase micro type, optional sorting button with
 * `aria-sort` (DESIGN.md §4 and §9).
 */
export function TableHead({
  children,
  className = '',
  numeric = false,
  sortDirection,
  onSort,
}: TableHeadProps) {
  const isSortable = typeof onSort === 'function';

  return (
    <th
      scope="col"
      aria-sort={sortDirection}
      className={`text-text-muted text-micro px-3 py-2 font-semibold tracking-wide uppercase ${numeric ? 'text-right' : 'text-left'} ${className}`.trim()}
    >
      {isSortable ? (
        <button
          type="button"
          onClick={onSort}
          className="hover:text-text inline-flex items-center gap-1"
        >
          {children}
          <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export interface TableCellProps extends TableSectionProps {
  numeric?: boolean;
}

/**
 * Body cell: 10px body text, numeric columns right aligned (DESIGN.md §9).
 */
export function TableCell({
  children,
  className = '',
  numeric = false,
}: TableCellProps) {
  return (
    <td
      className={`text-text text-body-sm px-3 py-2 align-middle ${numeric ? 'text-right' : 'text-left'} ${className}`.trim()}
    >
      {children}
    </td>
  );
}
