import { Controller } from 'react-hook-form';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { Toggle } from '../../../components/ui/Toggle';
import type { ProductCategoryDto } from '../../../types/api';
import { useCategoryForm } from '../hooks/useProductsPageState';

export interface CategoryFormModalProps {
  open: boolean;
  category: ProductCategoryDto | null;
  categories: readonly ProductCategoryDto[];
  onClose: () => void;
}

function CategoryFormModalContent({
  category,
  categories,
  onClose,
}: Omit<CategoryFormModalProps, 'open'>) {
  const {
    isEdit,
    formId,
    isPending,
    submitError,
    parentOptions,
    register,
    control,
    errors,
    isDirty,
    handleClose,
    handleFormSubmit,
  } = useCategoryForm({ category, categories, onClose });

  return (
    <Modal
      open
      onClose={handleClose}
      eyebrow={isEdit ? 'Product categories' : 'New category'}
      title={category ? `Edit ${category.name}` : 'Add category'}
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
            {isEdit ? 'Save changes' : 'Create category'}
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
          <Alert variant="danger" title="Could not save category">
            {submitError}
          </Alert>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Category code"
            placeholder="CAT-ANA"
            maxLength={30}
            disabled={isPending}
            error={errors.code?.message}
            {...register('code')}
          />
          <Input
            label="Category name"
            placeholder="Analgesics"
            maxLength={100}
            disabled={isPending}
            error={errors.name?.message}
            {...register('name')}
          />
        </div>
        <Select
          label="Parent category"
          options={parentOptions}
          disabled={isPending}
          error={errors.parent_category_id?.message}
          {...register('parent_category_id')}
        />
        <Textarea
          label="Description (optional)"
          placeholder="Brief category notes"
          maxLength={250}
          disabled={isPending}
          error={errors.description?.message}
          {...register('description')}
        />
        <div className="flex flex-col gap-1.5">
          <Controller
            name="is_active"
            control={control}
            render={({ field }) => (
              <Toggle
                label="Active category"
                description="Inactive categories stay hidden unless inactive items are included."
                checked={field.value}
                onChange={field.onChange}
                disabled={isPending}
              />
            )}
          />
          {errors.is_active?.message ? (
            <p role="alert" className="text-body-sm text-danger font-medium">
              {errors.is_active.message}
            </p>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

export function CategoryFormModal({
  open,
  category,
  categories,
  onClose,
}: CategoryFormModalProps) {
  if (!open) return null;
  return (
    <CategoryFormModalContent
      key={category?.category_id ?? 'new'}
      category={category}
      categories={categories}
      onClose={onClose}
    />
  );
}
