import { useId, type ComponentPropsWithRef } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends ComponentPropsWithRef<'select'> {
  label?: string;
  error?: string;
  hint?: string;
  options: readonly string[];
}

/**
 * Native select inside the shared 36px control shell with a custom chevron
 * (DESIGN.md §4). Options are plain strings — no rich option objects.
 */
export function Select({
  label,
  error,
  hint,
  options,
  id,
  className = '',
  ref,
  ...rest
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;
  const hintId = `${selectId}-hint`;
  // Only the message that is actually rendered is referenced.
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const selectClasses = [
    'h-9 w-full appearance-none rounded-sm border bg-surface pr-9 pl-3 text-body text-text',
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
        <label htmlFor={selectId} className="text-body text-text font-semibold">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={selectClasses}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown
          className="text-text-muted pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2"
          aria-hidden="true"
        />
      </div>
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
