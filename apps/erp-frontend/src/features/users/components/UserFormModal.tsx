import type { EmployeeDto } from '../../../features/employees';
import type { BranchDto, UserDto } from '../../../types/api';
import type {
  DirectoryQueryStatus,
  EmployeeDisplay,
} from '../hooks/useUsersPageState';
import { CreateUserFormModal } from './CreateUserFormModal';
import { EditUserFormModal } from './EditUserFormModal';

export interface UserFormModalProps {
  open: boolean;
  user: UserDto | null;
  eligibleEmployees: readonly EmployeeDto[];
  getEmployeeDisplay: (employeeId: string) => EmployeeDisplay;
  employeesDirectory: DirectoryQueryStatus;
  branches: readonly BranchDto[];
  branchesDirectory: DirectoryQueryStatus;
  onClose: () => void;
}

export function UserFormModal({
  open,
  user,
  eligibleEmployees,
  getEmployeeDisplay,
  employeesDirectory,
  branches,
  branchesDirectory,
  onClose,
}: UserFormModalProps) {
  if (!open) {
    return null;
  }

  if (user) {
    return (
      <EditUserFormModal
        key={user.user_id}
        user={user}
        employeeDisplay={getEmployeeDisplay(user.employee_id)}
        branches={branches}
        branchesDirectory={branchesDirectory}
        onClose={onClose}
      />
    );
  }

  return (
    <CreateUserFormModal
      key="new"
      eligibleEmployees={eligibleEmployees}
      employeesDirectory={employeesDirectory}
      branches={branches}
      branchesDirectory={branchesDirectory}
      onClose={onClose}
    />
  );
}
