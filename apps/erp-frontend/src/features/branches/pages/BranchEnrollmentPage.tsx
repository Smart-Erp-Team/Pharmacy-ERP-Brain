import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { PageHeading } from '../../../components/ui/PageHeading';
import { useAuth } from '../../../hooks/useAuth';
import type { BranchEnrollmentResult } from '../../../types/api';
import { BranchEnrollmentForm } from '../components/BranchEnrollmentForm';

export interface BranchEnrollmentPageProps {
  homePath?: string;
  loginPath?: string;
}

/**
 * Branch device enrollment (DESIGN.md §5.10): the first-run screen of a branch
 * device. Supports Unenrolled, Activating, Success, and Error states.
 */
export function BranchEnrollmentPage({
  homePath,
  loginPath,
}: BranchEnrollmentPageProps) {
  const { isAuthenticated, runtime } = useAuth();
  const isCloudRuntime = runtime === 'Cloud';
  const [enrolledResult, setEnrolledResult] =
    useState<BranchEnrollmentResult | null>(null);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <PageHeading
          eyebrow="Device"
          title="Branch Enrollment"
          description="Activate this branch device with the enrollment token issued by the head office."
        />

        <Card className="mt-6">
          <div className="flex flex-col gap-4 p-5">
            {isCloudRuntime ? (
              <Alert variant="warning" title="Wrong deployment">
                This screen belongs to a branch device. The current runtime is
                Cloud, so enrollment does not apply here.
              </Alert>
            ) : null}

            {enrolledResult ? (
              <div className="flex flex-col gap-4">
                <Alert variant="success" title="Branch terminal enrolled">
                  This device is now linked to branch{' '}
                  <span className="font-mono font-semibold">
                    {enrolledResult.branch_id}
                  </span>{' '}
                  and ready for initial sync.
                </Alert>

                <dl className="border-border bg-background text-body-sm grid grid-cols-1 gap-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-muted">Initial sync cursor</dt>
                    <dd className="text-text font-mono">
                      {enrolledResult.initial_cursor}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-text-muted">Credential valid until</dt>
                    <dd className="text-text">
                      {new Date(
                        enrolledResult.credential_expires_at
                      ).toLocaleDateString()}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-col gap-2">
                  {!isAuthenticated && loginPath ? (
                    <Link
                      to={loginPath}
                      className="bg-primary text-body-sm hover:bg-primary-hover focus-visible:ring-primary/30 inline-flex h-10 w-full items-center justify-center rounded-md px-4 font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      Continue to sign in
                    </Link>
                  ) : null}

                  {isAuthenticated && homePath ? (
                    <Link
                      to={homePath}
                      className="bg-primary text-body-sm hover:bg-primary-hover focus-visible:ring-primary/30 inline-flex h-10 w-full items-center justify-center rounded-md px-4 font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      Back to workspace
                    </Link>
                  ) : null}

                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() => setEnrolledResult(null)}
                  >
                    Enroll another token
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Alert variant="warning" title="One-time use">
                  An enrollment token can be redeemed once. It expires shortly
                  after it is issued by the head office.
                </Alert>

                <BranchEnrollmentForm
                  disabled={isCloudRuntime}
                  onEnrolled={setEnrolledResult}
                />
              </>
            )}

            {!enrolledResult ? (
              <div className="flex items-center gap-4">
                {isAuthenticated && homePath ? (
                  <Link
                    to={homePath}
                    className="text-body text-primary font-semibold hover:underline"
                  >
                    Back to workspace
                  </Link>
                ) : null}
                {!isAuthenticated && loginPath ? (
                  <Link
                    to={loginPath}
                    className="text-body text-primary font-semibold hover:underline"
                  >
                    Go to sign in
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
