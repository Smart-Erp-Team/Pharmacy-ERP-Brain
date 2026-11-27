import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import type { Product, ProductCategory } from '../../../types/api';
import { useEditProductForm } from '../hooks/useProductsPageState';
import { EditProductFormFields } from './EditProductFormFields';

export interface EditProductModalProps {
  open: boolean;
  product: Product | null;
  categories: readonly ProductCategory[];
  isCategoriesError?: boolean;
  isRetryingCategories?: boolean;
  onRetryCategories?: () => void;
  onClose: () => void;
}

type EditProductModalContentProps = Omit<
  EditProductModalProps,
  'open' | 'product'
> & {
  product: Product;
};

function EditProductModalContent({
  product,
  categories,
  isCategoriesError = false,
  isRetryingCategories = false,
  onRetryCategories,
  onClose,
}: EditProductModalContentProps) {
  const {
    formId,
    isPending,
    submitError,
    register,
    control,
    errors,
    isDirty,
    handleClose,
    handleFormSubmit,
  } = useEditProductForm({ product, onClose });

  return (
    <Modal
      open
      onClose={handleClose}
      eyebrow="Product catalog"
      title={`Edit ${product.name}`}
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
            disabled={isPending || !isDirty}
            isLoading={isPending}
          >
            Save changes
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
          <Alert variant="danger" title="Could not update product">
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

        <EditProductFormFields
          currentCategoryId={product.category_id}
          categories={categories}
          disabled={isPending}
          register={register}
          control={control}
          errors={errors}
        />
      </form>
    </Modal>
  );
}

export function EditProductModal(props: EditProductModalProps) {
  if (!props.open || !props.product) return null;
  return (
    <EditProductModalContent
      key={props.product.product_id}
      product={props.product}
      categories={props.categories}
      isCategoriesError={props.isCategoriesError}
      isRetryingCategories={props.isRetryingCategories}
      onRetryCategories={props.onRetryCategories}
      onClose={props.onClose}
    />
  );
}
