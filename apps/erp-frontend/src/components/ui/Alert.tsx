import type { ReactNode } from 'react';
import {
  CircleAlert,
  CircleCheck,
  Info,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger' | 'ai';

export interface AlertProps {
  title?: string;
  children?: ReactNode;
  variant?: AlertVariant;
  className?: string;
}

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  info: 'border-info/25 bg-info-soft text-info',
  success: 'border-success/25 bg-success-soft text-success',
  warning: 'border-warning/25 bg-warning-soft text-warning',
  danger: 'border-danger/25 bg-danger-soft text-danger',
  ai: 'border-ai/25 bg-ai-soft text-ai',
};

const VARIANT_ICONS: Record<AlertVariant, typeof Info> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
  ai: Sparkles,
};

/**
 * Inline notice (DESIGN.md §4 and §8): used for "Unavailable", "Awaiting
 * connected data" and local-preview notices. It never shows a fabricated value.
 */
export function Alert({
  title,
  children,
  variant = 'info',
  className = '',
}: AlertProps) {
  const Icon = VARIANT_ICONS[variant];

  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 ${VARIANT_CLASSES[variant]} ${className}`.trim()}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        {title ? <p className="text-body font-semibold">{title}</p> : null}
        {children ? (
          <div className="text-body-sm text-text-secondary">{children}</div>
        ) : null}
      </div>
    </div>
  );
}
