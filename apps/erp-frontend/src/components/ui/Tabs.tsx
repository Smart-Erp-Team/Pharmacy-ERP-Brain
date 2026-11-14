export interface TabsProps {
  labels: readonly string[];
  activeLabel: string;
  onChange: (label: string) => void;
  className?: string;
}

/**
 * Grouped tab strip (DESIGN.md §4): ghost buttons on a subtle grouped
 * background, the selected tab is a white surface with the small shadow.
 */
export function Tabs({
  labels,
  activeLabel,
  onChange,
  className = '',
}: TabsProps) {
  return (
    <div
      role="tablist"
      className={`bg-background inline-flex items-center gap-1 rounded-md p-1 ${className}`.trim()}
    >
      {labels.map((label) => {
        const isActive = label === activeLabel;

        return (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(label)}
            className={`text-body rounded-sm px-3 py-1.5 font-semibold transition-colors ${
              isActive
                ? 'bg-surface text-text shadow-sm'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
