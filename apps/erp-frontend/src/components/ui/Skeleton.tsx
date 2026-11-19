export interface SkeletonProps {
  className?: string;
}

/**
 * Loading placeholder (DESIGN.md §4): a shimmering block that stands in for a
 * row or a field while the data is loading.
 */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`bg-border/70 animate-pulse rounded-sm ${className}`.trim()}
    />
  );
}
