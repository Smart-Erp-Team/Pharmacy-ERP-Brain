import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import type { ProductCategoryDto } from '../../../types/api';
import { useCreateProductForm } from '../hooks/useProductsPageState';
import { CreateProductFormFields } from './CreateProductFormFields';

export interface CreateProductModalProps {
  open: boolean;
  categories: readonly ProductCategoryDto[];
  isCategoriesError?: boolean;
  isRetryingCategories?: boolean;
  onRetryCategories?: () => void;
  onClose: () => void;
}

function CreateProductModalContent({
  categories,
  isCategoriesError = false,
  isRetryingCategories = false,
  onRetryCategories,
  onClose,
}: Omit<CreateProductModalProps, 'open'>) {
  const {
    formId,
    isPending,
    submitError,
    register,
    control,
    errors,
    handleClose,
    handleSellableChange,
    handleFormSubmit,
  } = useCreateProductForm({ onClose });

  return (
    <Modal
      open
      onClose={handleClose}
      eyebrow="Product catalog"
      title="Add product"
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
            Create product
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
          <Alert variant="danger" title="Could not create product">
            {submitError}
          </Alert>
        ) : null}

        {isCategoriesError ? (
          <Alert variant="warning" title="Categories unavailable">
            <div className="flex items-center justify-between gap-3">
              <span>Category options could not be loaded.</span>
              {onRetryCategories ? (
                <Button
                  variant="secondary"
                  onClick={onRetryCategories}
                  disabled={isRetryingCategories}
                  isLoading={isRetryingCategories}
                >
                  Retry
                </Button>
              ) : null}
            </div>
          </Alert>
        ) : null}

        <CreateProductFormFields
          categories={categories}
          disabled={isPending}
          register={register}
          control={control}
          errors={errors}
          onSellableChange={handleSellableChange}
        />
      </form>
    </Modal>
  );
}

export function CreateProductModal(props: CreateProductModalProps) {
  if (!props.open) return null;
  return (
    <CreateProductModalContent
      categories={props.categories}
      isCategoriesError={props.isCategoriesError}
      isRetryingCategories={props.isRetryingCategories}
      onRetryCategories={props.onRetryCategories}
      onClose={props.onClose}
    />
  );
}
