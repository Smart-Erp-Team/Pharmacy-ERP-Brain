import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardHeader } from '../../../components/ui/Card';
import { PageHeading } from '../../../components/ui/PageHeading';
import { useAuth } from '../../../hooks/useAuth';
import { describeBranchScope } from '../../../lib/auth/permissions';

/**
 * Overview (DESIGN.md §5.1): the signed-in operator, the deployment context and
 * the workspace summary. The summary stays empty until the data is connected.
 */
export function DashboardPage() {
  const {
    currentUser,
    organizationCode,
    runtime,
    branchScope,
    branchIds,
    roles,
  } = useAuth();

  const username = currentUser?.username ?? 'Unavailable';
  const roleLabel = roles.length > 0 ? roles.join(', ') : 'Unavailable';
  const branchLabel =
    branchScope === 'ASSIGNED'
      ? `${branchIds.length} ${branchIds.length === 1 ? 'branch' : 'branches'} assigned`
      : describeBranchScope(branchScope);

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow="Workspace"
        title="Overview"
        description="Your pharmacy workspace: session context and the connected modules."
        status={
          <Badge variant="info" dot>
            {runtime ?? 'Runtime unavailable'}
          </Badge>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader title="Signed in" />
          <div className="flex flex-col gap-1 p-4">
            <span className="text-body text-text font-semibold">
              {username}
            </span>
            <span className="text-body-sm text-text-secondary">
              {roleLabel}
            </span>
            <span className="text-body-sm text-text-muted">
              {organizationCode ?? 'Organization unavailable'}
            </span>
          </div>
        </Card>

        <Card>
          <CardHeader title="Branch context" />
          <div className="flex flex-col gap-1 p-4">
            <span className="text-body text-text font-semibold">
              {branchLabel}
            </span>
            <span className="text-body-sm text-text-secondary">
              {runtime ?? 'Runtime unavailable'}
            </span>
          </div>
        </Card>

        <Card>
          <CardHeader title="Modules" />
          <div className="p-4">
            <span className="text-body-sm text-text-muted">
              Catalog, inventory and organization screens are available from the
              navigation.
            </span>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Workspace summary"
          description="Stock-out risk, reorder suggestions and pending approvals."
        />
        <div className="p-4">
          <Alert variant="ai" title="Awaiting connected data">
            The summary needs live catalog, sales and inventory data. Until
            those modules are connected the workspace shows no figures — it
            never invents them.
          </Alert>
        </div>
      </Card>
    </div>
  );
}
