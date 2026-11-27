import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { PageHeading } from '../../../components/ui/PageHeading';
import { useAuth } from '../../../hooks/useAuth';
import type { RedeemEnrollment } from '../../../types/api';
import { BranchEnrollmentForm } from '../components/BranchEnrollmentForm';

export interface BranchEnrollmentPageProps {
  homePath?: string;
  loginPath?: string;
}

const PRIMARY_LINK_CLASS =
  'bg-primary text-body-sm hover:bg-primary-hover focus-visible:ring-primary/30 inline-flex h-10 w-full items-center justify-center rounded-md px-4 font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:outline-none';

/**
 * Branch device enrollment (`POST /api/v1/branch-enrollment`, Cloud runtime).
 * Usable unauthenticated or on `Cloud`; warns and disables submission when
 * an authenticated session is running on `BranchLocal`.
 */
export function BranchEnrollmentPage({
  homePath,
  loginPath,
}: BranchEnrollmentPageProps) {
  const { isAuthenticated, runtime } = useAuth();
  const isBranchLocalRuntime = isAuthenticated && runtime === 'BranchLocal';
  const [enrolledResult, setEnrolledResult] = useState<RedeemEnrollment | null>(
    null
  );

  const navLink = isAuthenticated
    ? homePath
      ? { to: homePath, label: 'Back to workspace' }
      : null
    : loginPath
      ? {
          to: loginPath,
          label: 'Go to sign in',
          enrolledLabel: 'Continue to sign in',
        }
      : null;

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
            {isBranchLocalRuntime ? (
              <Alert variant="warning" title="Wrong deployment">
                Device enrollment must target the Cloud ERP API. The current
                session is connected to a BranchLocal runtime, which does not
                expose branch enrollment.
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
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-text-muted">Organization ID</dt>
                    <dd className="text-text font-mono break-all">
                      {enrolledResult.organization_id}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-text-muted">Branch ID</dt>
                    <dd className="text-text font-mono break-all">
                      {enrolledResult.branch_id}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-text-muted">Runtime credential</dt>
                    <dd className="text-text font-mono break-all select-all">
                      {enrolledResult.runtime_credential}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-text-muted">Initial sync cursor</dt>
                    <dd className="text-text font-mono">
                      {enrolledResult.initial_sync_cursor}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-text-muted">Credential expiry</dt>
                    <dd className="text-text">
                      {new Date(
                        enrolledResult.credential_expiry
                      ).toLocaleString()}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-col gap-2">
                  {navLink ? (
                    <Link to={navLink.to} className={PRIMARY_LINK_CLASS}>
                      {'enrolledLabel' in navLink
                        ? navLink.enrolledLabel
                        : navLink.label}
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
                  disabled={isBranchLocalRuntime}
                  onEnrolled={setEnrolledResult}
                />
                {navLink ? (
                  <Link
                    to={navLink.to}
                    className="text-body text-primary font-semibold hover:underline"
                  >
                    {navLink.label}
                  </Link>
                ) : null}
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
