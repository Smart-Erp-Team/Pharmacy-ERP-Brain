import { Alert } from '../../../components/ui/Alert';
import { Card, CardHeader } from '../../../components/ui/Card';
import { PageHeading } from '../../../components/ui/PageHeading';

/**
 * User accounts and access (DESIGN.md §5.12): accounts, roles, branch scope and
 * the security actions.
 */
export function UsersPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow="Organization & Identity"
        title="User Accounts"
        description="Accounts, roles, branch scope and session security for the organization."
      />

      <Card>
        <CardHeader
          title="Accounts"
          description="Employee, role, branch scope, account status and security actions."
        />
        <div className="p-4">
          <Alert variant="info" title="Awaiting connected data">
            Accounts are not connected yet. The register, the create/edit
            account form, the password reset and the session revoke actions
            arrive with the users API — no account is listed until the server
            answers.
          </Alert>
        </div>
      </Card>
    </div>
  );
}
