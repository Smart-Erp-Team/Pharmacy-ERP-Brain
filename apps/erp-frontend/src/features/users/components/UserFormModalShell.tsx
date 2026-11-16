import type { FormEventHandler, ReactNode } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import type { DirectoryQueryStatus } from '../hooks/useUsersPageState';
import { UserDirectoryAlerts } from './UserDirectoryAlerts';

export interface UserFormModalShellProps {
  formId: string;
  eyebrow: string;
  title: string;
  submitLabel: string;
  errorTitle: string;
  submitError: string | null;
  isPending: boolean;
  isSubmitDisabled: boolean;
  employeesDirectory?: DirectoryQueryStatus;
  branchesDirectory: DirectoryQueryStatus;
  onClose: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}

export function UserFormModalShell({
  formId,
  eyebrow,
  title,
  submitLabel,
  errorTitle,
  submitError,
  isPending,
  isSubmitDisabled,
  employeesDirectory,
  branchesDirectory,
  onClose,
  onSubmit,
  children,
}: UserFormModalShellProps) {
  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={eyebrow}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={isSubmitDisabled}
            isLoading={isPending}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        {submitError ? (
          <Alert variant="danger" title={errorTitle}>
            {submitError}
          </Alert>
        ) : null}
        <UserDirectoryAlerts
          employeesDirectory={employeesDirectory}
          branchesDirectory={branchesDirectory}
        />
        {children}
      </form>
    </Modal>
  );
}
