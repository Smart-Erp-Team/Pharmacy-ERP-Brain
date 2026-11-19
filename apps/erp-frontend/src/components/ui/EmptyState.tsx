import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

/**
 * Empty state (DESIGN.md §4): a centered icon, a title, a helper line and an
 * optional recovery action.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
      <span className="bg-background text-text-muted flex h-10 w-10 items-center justify-center rounded-full">
        {icon ?? <Inbox className="h-5 w-5" aria-hidden="true" />}
      </span>
      <p className="text-body text-text font-semibold">{title}</p>
      {description ? (
        <p className="text-body-sm text-text-muted max-w-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
