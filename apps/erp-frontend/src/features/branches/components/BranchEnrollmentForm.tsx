import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ApiClientError } from '../../../lib/api/client';
import type { BranchEnrollmentResult } from '../../../types/api';
import { useRedeemBranchEnrollmentMutation } from '../hooks/useBranches';
import {
  branchEnrollmentSchema,
  type BranchEnrollmentFormValues,
} from '../schemas/branchSchema';

export interface BranchEnrollmentFormProps {
  disabled?: boolean;
  onEnrolled: (result: BranchEnrollmentResult) => void;
}

interface EnrollmentErrorState {
  title: string;
  message: string;
}

function mapEnrollmentError(error: unknown): EnrollmentErrorState {
  if (error instanceof ApiClientError) {
    if (error.status === 410 || error.code === 'GONE') {
      return {
        title: 'Token expired or already used',
        message:
          'This enrollment token is no longer valid. Ask an administrator in the head office workspace to issue a fresh token.',
      };
    }
    if (error.status === 401 || error.code === 'UNAUTHORIZED') {
      return {
        title: 'Invalid enrollment token',
        message: 'The token was not recognized. Check for typos and try again.',
      };
    }
    const trace = error.trace_id ? ` (Trace: ${error.trace_id})` : '';
    return {
      title: 'Enrollment failed',
      message: `${error.message}${trace}`,
    };
  }

  return {
    title: 'Enrollment failed',
    message: 'Unable to activate this branch terminal. Please try again.',
  };
}

export function BranchEnrollmentForm({
  disabled = false,
  onEnrolled,
}: BranchEnrollmentFormProps) {
  const redeemMutation = useRedeemBranchEnrollmentMutation();
  const [errorState, setErrorState] = useState<EnrollmentErrorState | null>(
    null
  );

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
        payload: { token: values.token.trim() },
      });
      toast.success('Branch device enrolled successfully');
      onEnrolled(result);
    } catch (error) {
      if (error instanceof ApiClientError) {
        const tokenDetail = error.details?.find(
          (detail) => detail.field === 'token'
        );
        if (tokenDetail) {
          setError('token', { type: 'server', message: tokenDetail.issue });
        }
      }
      const mapped = mapEnrollmentError(error);
      setErrorState(mapped);
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
        disabled={disabled}
        isLoading={isBusy}
      >
        {isBusy ? 'Activating branch terminal...' : 'Activate branch terminal'}
      </Button>
    </form>
  );
}
