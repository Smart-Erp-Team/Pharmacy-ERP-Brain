import type { ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  className?: string;
}

/**
 * The shared surface shell: white surface, 1px border, 14px radius, small shadow
 * (DESIGN.md §2.4 and §3.3).
 */
export function Card({ children, className = '' }: CardProps) {
  return (
    <section
      className={`border-border bg-surface rounded-lg border shadow-sm ${className}`.trim()}
    >
      {children}
    </section>
  );
}

export interface CardHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Card header composition: title, optional description, optional action slot.
 */
export function CardHeader({
  title,
  description,
  action,
  className = '',
}: CardHeaderProps) {
  return (
    <header
      className={`border-border flex items-start justify-between gap-4 border-b px-4 py-3 ${className}`.trim()}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-card-title text-text">{title}</h2>
        {description ? (
          <p className="text-body-sm text-text-secondary">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 items-center gap-2">{action}</div>
      ) : null}
    </header>
  );
}
