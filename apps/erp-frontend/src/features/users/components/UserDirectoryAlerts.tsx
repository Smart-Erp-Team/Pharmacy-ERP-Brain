import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import type { DirectoryQueryStatus } from '../hooks/useUsersPageState';

export interface UserDirectoryAlertsProps {
  employeesDirectory?: DirectoryQueryStatus;
  branchesDirectory: DirectoryQueryStatus;
}

export function UserDirectoryAlerts({
  employeesDirectory,
  branchesDirectory,
}: UserDirectoryAlertsProps) {
  return (
    <>
      {employeesDirectory?.isError ? (
        <Alert variant="warning" title="Employees unavailable">
          <div className="flex items-center justify-between gap-3">
            <span>Eligible employee options could not be loaded.</span>
            <Button
              variant="secondary"
              onClick={employeesDirectory.onRetry}
              disabled={employeesDirectory.isRetrying}
              isLoading={employeesDirectory.isRetrying}
            >
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}

      {branchesDirectory.isError ? (
        <Alert variant="warning" title="Branches unavailable">
          <div className="flex items-center justify-between gap-3">
            <span>Branch access options could not be loaded.</span>
            <Button
              variant="secondary"
              onClick={branchesDirectory.onRetry}
              disabled={branchesDirectory.isRetrying}
              isLoading={branchesDirectory.isRetrying}
            >
              Retry
            </Button>
          </div>
        </Alert>
      ) : null}
    </>
  );
}
