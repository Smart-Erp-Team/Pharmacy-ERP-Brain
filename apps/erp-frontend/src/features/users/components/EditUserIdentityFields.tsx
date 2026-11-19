import { Input } from '../../../components/ui/Input';
import type { EmployeeDisplay } from '../hooks/useUsersPageState';

export interface EditUserIdentityFieldsProps {
  employeeDisplay: EmployeeDisplay;
  username: string;
}

export function EditUserIdentityFields({
  employeeDisplay,
  username,
}: EditUserIdentityFieldsProps) {
  const employeeLabel = employeeDisplay.secondary
    ? `${employeeDisplay.primary} (${employeeDisplay.secondary})`
    : employeeDisplay.primary;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Input
        label="Employee"
        value={employeeLabel}
        disabled
        readOnly
        hint="Employee link is permanent once created."
      />
      <Input
        label="Username"
        value={username}
        disabled
        readOnly
        hint="Username is immutable once created."
      />
    </div>
  );
}
