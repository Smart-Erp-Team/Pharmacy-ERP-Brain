import { useId } from 'react';

export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Switch-style toggle (DESIGN.md §5.3 and §9): a button that reports its state
 * with `aria-checked`. Used for the boolean master data flags — is_active,
 * is_sellable, is_purchasable, lot_tracking_required.
 */
export function Toggle({
  label,
  checked,
  onChange,
  description,
  disabled = false,
  id,
}: ToggleProps) {
  const generatedId = useId();
  const labelId = id ?? generatedId;
  const descriptionId = `${labelId}-description`;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span id={labelId} className="text-body text-text font-semibold">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="text-body-sm text-text-muted">
            {description}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`focus-visible:ring-primary/40 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
          checked
            ? 'bg-primary border-primary'
            : 'bg-background border-border-strong'
        }`}
      >
        <span
          aria-hidden="true"
          className={`bg-surface h-5 w-5 rounded-full shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
