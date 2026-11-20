import type { ReactNode } from 'react';

export type BadgeVariant =
  'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'ai';

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'border-border bg-background text-text-secondary',
  success: 'border-success/25 bg-success-soft text-success',
  warning: 'border-warning/25 bg-warning-soft text-warning',
  danger: 'border-danger/25 bg-danger-soft text-danger',
  info: 'border-info/25 bg-info-soft text-info',
  ai: 'border-ai/25 bg-ai-soft text-ai',
};

/**
 * Status pill (DESIGN.md §4): 22px minimum height, 8px horizontal padding.
 * The label always accompanies the color, so the meaning never depends on hue.
 */
export function Badge({
  children,
  variant = 'neutral',
  dot = false,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`text-caption inline-flex min-h-[22px] items-center gap-1.5 rounded-full border px-2 font-semibold ${VARIANT_CLASSES[variant]} ${className}`.trim()}
    >
      {dot ? (
        <span
          className="h-1.5 w-1.5 rounded-full bg-current"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}
