import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { toast } from 'react-toastify';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { ApiClientError } from '../../../lib/api/client';
import type { User } from '../../../types/api';
import { useRevokeUserSessionsMutation } from '../hooks/useUsers';

export interface RevokeSessionsModalProps {
  user: User | null;
  onClose: () => void;
}

export function RevokeSessionsModal({
  user,
  onClose,
}: RevokeSessionsModalProps) {
  const revokeMutation = useRevokeUserSessionsMutation();
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  const isPending = revokeMutation.isPending;

  const handleClose = () => {
    if (isPending) {
      return;
    }
    setSubmitError(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (isPending) {
      return;
    }
    setSubmitError(null);
    try {
      await revokeMutation.mutateAsync({ userId: user.user_id });
      toast.success(`Active sessions revoked for ${user.username}`);
      onClose();
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.trace_id
            ? `${error.message} (Trace: ${error.trace_id})`
            : error.message
          : 'Unable to revoke active sessions. Please try again.';
      setSubmitError(message);
      toast.error(message);
    }
  };

  return (
    <Modal
      open
      onClose={handleClose}
      eyebrow="Security action"
      title={`Revoke sessions for ${user.username}`}
      icon={<ShieldAlert className="h-4 w-4" />}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              void handleConfirm();
            }}
            disabled={isPending}
            isLoading={isPending}
          >
            Revoke sessions
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {submitError ? (
          <Alert variant="danger" title="Could not revoke sessions">
            {submitError}
          </Alert>
        ) : null}

        <Alert variant="warning" title="Force sign-out across devices">
          Revoking active sessions immediately invalidates all refresh tokens
          for <span className="font-mono font-semibold">{user.username}</span>{' '}
          and forces sign-out across all signed-in devices.
        </Alert>
      </div>
    </Modal>
  );
}
