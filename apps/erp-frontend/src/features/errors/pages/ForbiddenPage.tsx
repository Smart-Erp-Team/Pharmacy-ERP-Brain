export interface ForbiddenPageProps {
  homePath?: string;
  reason?: string;
}

/**
 * 403 screen (DESIGN.md tokens). Shown when the session may not open a screen:
 * the role gate and the runtime gate both render it.
 */
export function ForbiddenPage({ homePath, reason }: ForbiddenPageProps) {
  return (
    <div
      data-testid="role-gate-forbidden"
      className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center"
    >
      <div className="border-border bg-surface max-w-md rounded-lg border p-8 shadow-sm">
        <h1 className="text-display text-text">403 Forbidden</h1>
        <p className="text-body text-text-secondary mt-2">
          You do not have the required permissions to view this section.
        </p>
        {reason ? (
          <p className="text-body-sm text-text-muted mt-2">{reason}</p>
        ) : null}
        {homePath ? (
          <a
            href={homePath}
            className="bg-primary text-body mt-5 inline-flex min-h-9 items-center justify-center rounded-sm px-3.5 font-semibold text-white"
          >
            Back to overview
          </a>
        ) : null}
      </div>
    </div>
  );
}
