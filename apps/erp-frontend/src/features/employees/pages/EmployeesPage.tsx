import { Alert } from '../../../components/ui/Alert';
import { Card, CardHeader } from '../../../components/ui/Card';
import { PageHeading } from '../../../components/ui/PageHeading';

/**
 * Employees (DESIGN.md §5.11): the employee register with its add/edit form.
 */
export function EmployeesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow="Organization & Identity"
        title="Employees"
        description="Employee register: identity, home branch, hire date and account status."
      />

      <Card>
        <CardHeader
          title="Employee register"
          description="Employee number, full name, job title, home branch, phone and hire date."
        />
        <div className="p-4">
          <Alert variant="info" title="Awaiting connected data">
            Employees are not connected yet. The register, the soft
            activate/deactivate action and the add/edit employee form arrive
            with the employee API — no record is listed until the server
            answers.
          </Alert>
        </div>
      </Card>
    </div>
  );
}
