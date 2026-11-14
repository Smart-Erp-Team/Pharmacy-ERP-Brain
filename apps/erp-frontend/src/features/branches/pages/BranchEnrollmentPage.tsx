import { Alert } from '../../../components/ui/Alert';
import { Card } from '../../../components/ui/Card';
import { PageHeading } from '../../../components/ui/PageHeading';

/**
 * Branch device enrollment (DESIGN.md §5.10): the first-run screen of a branch
 * device. It is reachable before a session exists, because the device is not
 * enrolled yet.
 */
export function BranchEnrollmentPage() {
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
            <Alert variant="info" title="Enrollment is not connected yet">
              The token field and the activation call arrive with the enrollment
              API. Until then no token is accepted and nothing is activated on
              this device.
            </Alert>

            <Alert variant="warning" title="One-time use">
              An enrollment token can be redeemed once. It expires shortly after
              it is issued by the head office.
            </Alert>
          </div>
        </Card>
      </div>
    </div>
  );
}
