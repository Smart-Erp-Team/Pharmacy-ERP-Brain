import { useId, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import type { User } from '../../../types/api';
import { useResetUserPasswordMutation } from '../hooks/useUsers';
import { applyPasswordResetFormApiError } from '../schemas/userErrorMapper';
import {
  DEFAULT_PASSWORD_RESET_VALUES,
  MIN_PASSWORD_LENGTH,
  passwordResetSchema,
  toPasswordResetPayload,
  type PasswordResetFormValues,
} from '../schemas/userSchema';

export interface ResetPasswordModalProps {
  user: User | null;
  onClose: () => void;
}

export function ResetPasswordModal({ user, onClose }: ResetPasswordModalProps) {
  const formId = useId();
  const resetMutation = useResetUserPasswordMutation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<PasswordResetFormValues>({
    resolver: zodResolver(passwordResetSchema),
    mode: 'onTouched',
    defaultValues: DEFAULT_PASSWORD_RESET_VALUES,
  });

  if (!user) return null;

  const { errors } = form.formState;
  const isPending = resetMutation.isPending;

  const handleClose = () => {
    if (isPending) return;
    form.reset(DEFAULT_PASSWORD_RESET_VALUES);
    setSubmitError(null);
    onClose();
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (isPending) return;
    setSubmitError(null);
    try {
      await resetMutation.mutateAsync({
        userId: user.user_id,
        payload: toPasswordResetPayload(values),
      });
      form.reset(DEFAULT_PASSWORD_RESET_VALUES);
      setSubmitError(null);
      toast.success(`Password reset for ${user.username}`);
      onClose();
    } catch (error) {
      const formError = applyPasswordResetFormApiError(error, form.setError);
      if (formError) {
        setSubmitError(formError);
        toast.error(formError);
      }
    }
  });

  return (
    <Modal
      open
      onClose={handleClose}
      eyebrow="Security action"
      title={`Reset password for ${user.username}`}
      icon={<KeyRound className="h-4 w-4" />}
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
            type="submit"
            form={formId}
            disabled={isPending}
            isLoading={isPending}
          >
            Reset password
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
          <Alert variant="danger" title="Could not reset password">
            {submitError}
          </Alert>
        ) : null}

        <Alert variant="info">
          Set a new password (at least {MIN_PASSWORD_LENGTH} characters) for{' '}
          <span className="font-mono font-semibold">{user.username}</span>.
        </Alert>

        <Input
          type="password"
          label="New password"
          placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
          autoComplete="new-password"
          disabled={isPending}
          error={errors.new_password?.message}
          {...form.register('new_password')}
        />

        <Input
          type="password"
          label="Confirm password"
          placeholder="Re-enter new password"
          autoComplete="new-password"
          disabled={isPending}
          error={errors.confirm_password?.message}
          {...form.register('confirm_password')}
        />
      </form>
    </Modal>
  );
}
