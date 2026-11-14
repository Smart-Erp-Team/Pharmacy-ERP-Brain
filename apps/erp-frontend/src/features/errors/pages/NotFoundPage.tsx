export interface NotFoundPageProps {
  homePath?: string;
}

/**
 * 404 screen for an unknown route. It never guesses a destination for the user.
 */
export function NotFoundPage({ homePath }: NotFoundPageProps) {
  return (
    <div
      data-testid="not-found"
      className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center"
    >
      <div className="border-border bg-surface max-w-md rounded-lg border p-8 shadow-sm">
        <h1 className="text-display text-text">404 Not Found</h1>
        <p className="text-body text-text-secondary mt-2">
          This screen does not exist in the workspace.
        </p>
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
