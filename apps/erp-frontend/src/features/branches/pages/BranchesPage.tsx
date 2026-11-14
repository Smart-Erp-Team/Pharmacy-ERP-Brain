import { Alert } from '../../../components/ui/Alert';
import { Card, CardHeader } from '../../../components/ui/Card';
import { PageHeading } from '../../../components/ui/PageHeading';

/**
 * Branches (DESIGN.md §5.9): branch directory, enrollment token and branch
 * status. The directory itself is built on top of the connected API.
 */
export function BranchesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow="Organization & Identity"
        title="Branches"
        description="Branch directory, enrollment tokens and branch status for the organization."
      />

      <Card>
        <CardHeader
          title="Branch directory"
          description="Search, status filter and per-branch actions."
        />
        <div className="p-4">
          <Alert variant="info" title="Awaiting connected data">
            Branch records are not connected yet. The directory, the search
            toolbar and the add/edit branch form arrive with the branch API — no
            branch is listed until the server answers.
          </Alert>
        </div>
      </Card>
    </div>
  );
}
