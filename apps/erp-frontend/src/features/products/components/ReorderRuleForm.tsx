import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Toggle } from '../../../components/ui/Toggle';
import type {
  ProductDto,
  ReorderRuleDto,
  RuntimeMode,
} from '../../../types/api';
import { useReorderRuleForm } from '../hooks/useReorderRuleForm';

export interface ReorderRuleFormProps {
  branchId: string;
  product: ProductDto;
  rule: ReorderRuleDto | null;
  canWrite: boolean;
  runtime: RuntimeMode | null;
}

const FIELDS = [
  { name: 'reorder_point_base', label: 'Reorder point', placeholder: '100' },
  {
    name: 'reorder_quantity_base',
    label: 'Reorder quantity',
    placeholder: '250',
  },
  {
    name: 'max_quantity_base',
    label: 'Maximum stock quantity',
    placeholder: 'Optional',
  },
] as const;

export function ReorderRuleForm({
  branchId,
  product,
  rule,
  canWrite,
  runtime,
}: ReorderRuleFormProps) {
  const {
    isPending,
    isDirty,
    submitError,
    errors,
    isActive,
    register,
    setActive,
    onSubmit,
  } = useReorderRuleForm(branchId, product, rule, canWrite);
  const disabled = !canWrite || isPending;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {!canWrite && (
        <Alert variant="info">
          {runtime === 'BranchLocal'
            ? 'Reorder configuration writes require the Cloud deployment'
            : 'Reorder configuration writes require inventory write permission on the Cloud deployment.'}
        </Alert>
      )}
      {rule === null && (
        <Alert variant="info">
          No reorder rule configured yet for this branch
        </Alert>
      )}
      {submitError && (
        <Alert variant="danger" title="Could not save reorder rule">
          {submitError}
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {FIELDS.map((f) => (
          <Input
            key={f.name}
            label={f.label}
            type="text"
            inputMode="decimal"
            placeholder={f.placeholder}
            disabled={disabled}
            hint={
              f.name === 'max_quantity_base'
                ? `Optional cap in ${product.base_uom_code}`
                : `Base unit (${product.base_uom_code})`
            }
            error={errors[f.name]?.message}
            {...register(f.name)}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <Toggle
          label="Active reorder rule"
          description="Reorder thresholds are configuration-only and never auto-create purchase orders."
          checked={isActive}
          disabled={disabled}
          onChange={setActive}
        />
        {errors.is_active?.message && (
          <p role="alert" className="text-body-sm text-danger font-medium">
            {errors.is_active.message}
          </p>
        )}
      </div>
      {canWrite && (
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={isPending || !isDirty}
            isLoading={isPending}
          >
            Save reorder rule
          </Button>
        </div>
      )}
    </form>
  );
}
