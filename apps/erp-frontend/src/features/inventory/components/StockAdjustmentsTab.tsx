import { Plus } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import type { InventoryTxn } from '../../../types/api';
import { useAdjustmentForm } from '../hooks/useAdjustmentForm';
import { AdjustmentFormHeader } from './AdjustmentFormHeader';
import { AdjustmentLineRow } from './AdjustmentLineRow';

export interface StockAdjustmentsTabProps {
  branchId: string;
  initialReversalTxn?: InventoryTxn | null;
  onClearReversal?: () => void;
}

export function StockAdjustmentsTab({
  branchId,
  initialReversalTxn = null,
  onClearReversal,
}: StockAdjustmentsTabProps) {
  const form = useAdjustmentForm({
    branchId,
    initialReversalTxn,
    onClearReversal,
  });

  if (!form.canAccessTab || !branchId.trim()) {
    return (
      <Card>
        <CardHeader title="Stock Adjustments & Opening Balance" />
        {!form.canAccessTab ? (
          <div className="p-4">
            <Alert variant="warning" title="Access restricted">
              Stock adjustments and opening balances are available to Admin and
              Pharmacist roles with inventory read access only.
            </Alert>
          </div>
        ) : (
          <EmptyState
            title="Select a branch"
            description="Choose an active branch to post stock adjustments or reversals."
          />
        )}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {form.readOnlyNotice ? (
        <Alert variant="info" title={form.readOnlyNotice.title}>
          {form.readOnlyNotice.body}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Stock Adjustments & Opening Balance"
          description="Post atomic opening balances, stock adjustments, or reversals of posted ledger transactions."
        />
        <div className="p-4">
          {form.hasLookupsError ? (
            <Alert variant="danger" title="Could not load adjustment options">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{form.lookupsErrorMessage}</span>
                <Button variant="secondary" onClick={form.retryLookups}>
                  Retry
                </Button>
              </div>
            </Alert>
          ) : form.isLoadingLookups ? (
            <div
              role="status"
              aria-busy="true"
              aria-label="Loading adjustment options"
              className="flex flex-col gap-3"
            >
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : (
            <form
              onSubmit={form.onSubmit}
              className="flex flex-col gap-4"
              noValidate
            >
              {form.submitError ? (
                <Alert variant="danger" title="Adjustment submission failed">
                  {form.submitError}
                </Alert>
              ) : null}
              <AdjustmentFormHeader {...form.headerProps} />
              {form.transactionType !== 'REVERSAL' ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-card-title text-text">
                      Adjustment lines
                    </h3>
                    <Button
                      variant="secondary"
                      disabled={form.isFormDisabled}
                      leadingIcon={
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      }
                      onClick={form.handleAddLine}
                    >
                      Add line
                    </Button>
                  </div>
                  {form.linesError ? (
                    <Alert variant="danger">{form.linesError}</Alert>
                  ) : null}
                  <div className="flex flex-col gap-3">
                    {form.fields.map((field, index) => (
                      <AdjustmentLineRow
                        key={field.id}
                        index={index}
                        lineErrors={form.errors.lines?.[index]}
                        {...form.lineRowBaseProps}
                      />
                    ))}
                  </div>
                </>
              ) : null}
              {form.canWriteAdjustments ? (
                <div className="border-border flex flex-wrap items-center justify-end gap-2 border-t pt-4">
                  <Button
                    type="submit"
                    disabled={form.isSubmittingForm}
                    isLoading={form.isSubmittingForm}
                  >
                    Submit adjustment
                  </Button>
                </div>
              ) : null}
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
