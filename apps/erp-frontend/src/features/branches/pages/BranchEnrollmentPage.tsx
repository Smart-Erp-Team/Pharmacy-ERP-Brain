import { Link } from 'react-router-dom';
import { Alert } from '../../../components/ui/Alert';
import { Card } from '../../../components/ui/Card';
import { PageHeading } from '../../../components/ui/PageHeading';
import { useAuth } from '../../../hooks/useAuth';

export interface BranchEnrollmentPageProps {
  homePath?: string;
  loginPath?: string;
}

/**
 * Branch device enrollment (DESIGN.md §5.10): the first-run screen of a branch
 * device. It is reachable before a session exists, because the device is not
 * enrolled yet.
 *
 * The page stays public on purpose. When a session does exist, the runtime
 * decides whether this screen makes sense: it belongs to the BranchLocal
 * runtime, and the router may still wrap it in a RuntimeGate.
 */
export function BranchEnrollmentPage({
  homePath,
  loginPath,
}: BranchEnrollmentPageProps) {
  const { isAuthenticated, runtime } = useAuth();
  const isCloudRuntime = runtime === 'Cloud';

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

            <Alert variant="info" title="Enrollment is not connected yet">
              The token field and the activation call arrive with the enrollment
              API. Until then no token is accepted and nothing is activated on
              this device.
            </Alert>

            <Alert variant="warning" title="One-time use">
              An enrollment token can be redeemed once. It expires shortly after
              it is issued by the head office.
            </Alert>

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
          </div>
        </Card>
      </div>
    </div>
  );
}
