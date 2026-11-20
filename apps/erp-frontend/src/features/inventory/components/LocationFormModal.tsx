import { useId, useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { z } from 'zod';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import type { InventoryLocationDto } from '../../../types/api';
import {
  useCreateInventoryLocationMutation,
  usePatchInventoryLocationMutation,
} from '../hooks/useInventoryMutations';
import { applyLocationFormApiError } from '../schemas/inventoryErrorMapper';
import {
  createLocationFormSchema,
  DEFAULT_LOCATION_FORM_VALUES,
  editLocationFormSchema,
  locationDtoToFormValues,
  toCreateLocationPayload,
  toLocationPatchPayload,
  type CreateLocationFormValues,
} from '../schemas/inventoryLocationSchema';
import { LocationFormFields } from './LocationFormFields';

export interface LocationFormModalProps {
  open: boolean;
  branchId: string;
  location: InventoryLocationDto | null;
  onClose: () => void;
}

function LocationFormModalContent({
  branchId,
  location,
  onClose,
}: Omit<LocationFormModalProps, 'open'>) {
  const isEdit = location !== null;
  const formId = useId();
  const createMutation = useCreateInventoryLocationMutation();
  const patchMutation = usePatchInventoryLocationMutation();
  const isPending = createMutation.isPending || patchMutation.isPending;
  const [submitError, setSubmitError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      isEdit
        ? editLocationFormSchema.extend({ location_code: z.string() })
        : createLocationFormSchema,
    [isEdit]
  );

  const defaultValues: CreateLocationFormValues = location
    ? {
        location_code: location.location_code,
        ...locationDtoToFormValues(location),
      }
    : DEFAULT_LOCATION_FORM_VALUES;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isDirty },
  } = useForm<CreateLocationFormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues,
  });

  const handleClose = () => {
    if (!isPending) onClose();
  };

  const handleFormSubmit = handleSubmit(async (values) => {
    if (isPending || (isEdit && !isDirty)) return;
    setSubmitError(null);
    try {
      if (location) {
        await patchMutation.mutateAsync({
          locationId: location.location_id,
          payload: toLocationPatchPayload(values),
        });
        toast.success(`Location "${values.name.trim()}" updated`);
      } else {
        await createMutation.mutateAsync({
          payload: toCreateLocationPayload(values, branchId),
        });
        toast.success(`Location "${values.name.trim()}" created`);
      }
      onClose();
    } catch (error) {
      const formError = applyLocationFormApiError(error, setError, 'create');
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
      eyebrow={isEdit ? 'Storage locations' : 'New storage location'}
      title={location ? `Edit ${location.name}` : 'Add storage location'}
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
            disabled={isPending || (isEdit && !isDirty)}
            isLoading={isPending}
          >
            {isEdit ? 'Save changes' : 'Create location'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={handleFormSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        {submitError ? (
          <Alert variant="danger" title="Could not save location">
            {submitError}
          </Alert>
        ) : null}

        <Controller
          name="is_active"
          control={control}
          render={({ field }) => (
            <LocationFormFields
              isEdit={isEdit}
              locationCode={location?.location_code}
              codeInputProps={isEdit ? undefined : register('location_code')}
              nameInputProps={register('name')}
              locationTypeSelectProps={register('location_type')}
              isActive={field.value}
              onIsActiveChange={field.onChange}
              errors={{
                location_code: errors.location_code?.message,
                name: errors.name?.message,
                location_type: errors.location_type?.message,
                is_active: errors.is_active?.message,
              }}
              disabled={isPending}
            />
          )}
        />
      </form>
    </Modal>
  );
}

export function LocationFormModal({
  open,
  branchId,
  location,
  onClose,
}: LocationFormModalProps) {
  if (!open) return null;
  return (
    <LocationFormModalContent
      key={location?.location_id ?? 'new'}
      branchId={branchId}
      location={location}
      onClose={onClose}
    />
  );
}
