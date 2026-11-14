import { useId, type ComponentPropsWithRef } from 'react';

export interface TextareaProps extends ComponentPropsWithRef<'textarea'> {
  label?: string;
  error?: string;
  hint?: string;
  rows?: number;
}

/**
 * Multi-line control with the same label, error and hint pattern as the Input
 * and the Select (DESIGN.md §4 — the shared textarea was still missing).
 */
export function Textarea({
  label,
  error,
  hint,
  rows = 3,
  id,
  className = '',
  ref,
  ...rest
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const errorId = `${textareaId}-error`;
  const hintId = `${textareaId}-hint`;
  // Only the message that is actually rendered is referenced.
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const textareaClasses = [
    'w-full rounded-sm border bg-surface px-3 py-2 text-body text-text placeholder:text-text-muted',
    'transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25 focus:outline-none',
    'disabled:cursor-not-allowed disabled:bg-background disabled:text-text-muted',
    error ? 'border-danger' : 'border-border-strong',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label
          htmlFor={textareaId}
          className="text-body text-text font-semibold"
        >
          {label}
        </label>
      ) : null}
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        className={textareaClasses}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-body-sm text-danger font-medium"
        >
          {error}
        </p>
      ) : null}
      {hint && !error ? (
        <p id={hintId} className="text-body-sm text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
