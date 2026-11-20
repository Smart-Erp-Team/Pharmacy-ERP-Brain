import type { ReactNode } from 'react';

export interface PageHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  status?: ReactNode;
  actions?: ReactNode;
}

/**
 * Page heading pattern (DESIGN.md §3.3): title block on the left, actions on the
 * right. Order: uppercase eyebrow, title/status row, description.
 */
export function PageHeading({
  eyebrow,
  title,
  description,
  status,
  actions,
}: PageHeadingProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        {eyebrow ? (
          <span className="text-caption text-text-muted font-semibold tracking-wide uppercase">
            {eyebrow}
          </span>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-display text-text">{title}</h1>
          {status}
        </div>
        {description ? (
          <p className="text-body text-text-secondary max-w-2xl">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
