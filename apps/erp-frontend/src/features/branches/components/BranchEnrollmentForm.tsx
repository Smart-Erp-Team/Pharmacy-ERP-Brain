import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import type { RedeemEnrollment } from '../../../types/api';
import { useRedeemBranchEnrollmentMutation } from '../hooks/useBranches';
import {
  applyBranchEnrollmentApiError,
  type BranchEnrollmentErrorState,
} from '../schemas/branchErrorMapper';
import {
  branchEnrollmentSchema,
  toRedeemBranchEnrollmentPayload,
  type BranchEnrollmentFormValues,
} from '../schemas/branchSchema';

export interface BranchEnrollmentFormProps {
  disabled?: boolean;
  onEnrolled: (result: RedeemEnrollment) => void;
}

export function BranchEnrollmentForm({
  disabled = false,
  onEnrolled,
}: BranchEnrollmentFormProps) {
  const redeemMutation = useRedeemBranchEnrollmentMutation();
  const [errorState, setErrorState] =
    useState<BranchEnrollmentErrorState | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<BranchEnrollmentFormValues>({
    resolver: zodResolver(branchEnrollmentSchema),
    mode: 'onTouched',
    defaultValues: { token: '' },
  });

  const isBusy = redeemMutation.isPending;

  const onSubmit = async (values: BranchEnrollmentFormValues) => {
    if (isBusy || disabled) {
      return;
    }

    setErrorState(null);
    try {
      const result = await redeemMutation.mutateAsync({
        payload: toRedeemBranchEnrollmentPayload(values),
      });
      toast.success('Branch device enrolled successfully');
      onEnrolled(result);
    } catch (error: unknown) {
      setErrorState(applyBranchEnrollmentApiError(error, setError));
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      {errorState ? (
        <Alert variant="danger" title={errorState.title}>
          {errorState.message}
        </Alert>
      ) : null}

      {isBusy ? (
        <Alert variant="info" title="Activating branch terminal">
          Validating your enrollment token and provisioning the local runtime
          credential...
        </Alert>
      ) : null}

      <Input
        label="Enrollment token"
        placeholder="Paste single-use enrollment token"
        leadingIcon={<KeyRound className="h-4 w-4" />}
        disabled={disabled || isBusy}
        error={errors.token?.message}
        {...register('token')}
      />

      <Button
        type="submit"
        variant="primary"
        fullWidth
        disabled={disabled || isBusy}
        isLoading={isBusy}
      >
        {isBusy ? 'Activating branch terminal...' : 'Activate branch terminal'}
      </Button>
    </form>
  );
}
