import { useId } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import type { InventoryLocation } from '../../../types/api';
import { useLocationModalForm } from '../hooks/useInventoryBranchState';
import { LocationFormFields } from './LocationFormFields';

export interface LocationFormModalProps {
  open: boolean;
  branchId: string;
  location: InventoryLocation | null;
  onClose: () => void;
}

export function LocationFormModal({
  open,
  branchId,
  location,
  onClose,
}: LocationFormModalProps) {
  const formId = useId();
  const form = useLocationModalForm({ branchId, location, onClose });

  if (!open) return null;

  const locationTypeField = form.isEdit
    ? undefined
    : form.createRegister('location_type');
  const locationTypeSelectProps = locationTypeField
    ? {
        ...locationTypeField,
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
          void locationTypeField.onChange(event);
          form.onCreateLocationTypeChange(event.target.value);
        },
      }
    : undefined;

  return (
    <Modal
      open
      onClose={form.handleClose}
      eyebrow={form.isEdit ? 'Storage locations' : 'New storage location'}
      title={location ? `Edit ${location.name}` : 'Add storage location'}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={form.handleClose}
            disabled={form.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={form.isPending || (form.isEdit && !form.isDirty)}
            isLoading={form.isPending}
          >
            {form.isEdit ? 'Save changes' : 'Create location'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={form.handleFormSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        {form.submitError ? (
          <Alert variant="danger" title="Could not save location">
            {form.submitError}
          </Alert>
        ) : null}

        <LocationFormFields
          isEdit={form.isEdit}
          locationCode={location?.location_code}
          locationType={form.locationType}
          codeInputProps={
            form.isEdit ? undefined : form.createRegister('location_code')
          }
          nameInputProps={
            form.isEdit
              ? form.editRegister('name')
              : form.createRegister('name')
          }
          locationTypeSelectProps={locationTypeSelectProps}
          isSellable={form.isSellable}
          onIsSellableChange={form.onIsSellableChange}
          isActive={form.isActive}
          onIsActiveChange={form.isEdit ? form.onIsActiveChange : undefined}
          errors={form.errors}
          disabled={form.isPending}
        />
      </form>
    </Modal>
  );
}
