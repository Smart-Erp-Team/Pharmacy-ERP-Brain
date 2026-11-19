import { Plus } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import type { InventoryTxnDto } from '../../../types/api';
import { useAdjustmentForm } from '../hooks/useAdjustmentForm';
import { AdjustmentFormHeader } from './AdjustmentFormHeader';
import { AdjustmentLineRow } from './AdjustmentLineRow';
import { DraftAdjustmentsList } from './DraftAdjustmentsList';

export interface StockAdjustmentsTabProps {
  branchId: string;
  initialReversalTxn?: InventoryTxnDto | null;
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
            description="Choose an active branch to view draft adjustments or post stock movements."
          />
        )}
      </Card>
    );
  }

  const linesError =
    form.errors.lines?.root?.message ??
    (typeof form.errors.lines?.message === 'string'
      ? form.errors.lines.message
      : undefined);

  return (
    <div className="flex flex-col gap-4">
      {form.runtime !== 'BranchLocal' ? (
        <Alert variant="info" title="BranchLocal runtime required">
          Stock adjustments and opening balances must be posted on the
          BranchLocal runtime.
        </Alert>
      ) : !form.canWriteAdjustments ? (
        <Alert variant="info" title="Read-only access">
          Posting or editing stock adjustments requires the inventory:write
          permission.
        </Alert>
      ) : null}

      <DraftAdjustmentsList {...form.draftListProps} />

      <Card>
        <CardHeader
          title={
            form.editingDraftTxn
              ? `Edit Draft ${form.editingDraftTxn.transaction_no}`
              : 'Stock Adjustments & Opening Balance'
          }
          description="Record opening stock, authorized adjustments, or reversals of posted ledger transactions."
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
              {form.submitError && (
                <Alert variant="danger" title="Adjustment submission failed">
                  {form.submitError}
                </Alert>
              )}
              {form.editingDraftTxn && (
                <Alert variant="info">
                  Editing draft {form.editingDraftTxn.transaction_no}.
                  Transaction type and reversal target cannot be changed.
                </Alert>
              )}
              <AdjustmentFormHeader {...form.headerProps} />
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-card-title text-text">Adjustment lines</h3>
                <Button
                  variant="secondary"
                  disabled={form.isFormDisabled}
                  leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                  onClick={form.handleAddLine}
                >
                  Add line
                </Button>
              </div>
              {linesError && <Alert variant="danger">{linesError}</Alert>}
              <div className="flex flex-col gap-3">
                {form.fields.map((field, index) => (
                  <AdjustmentLineRow
                    key={field.id}
                    index={index}
                    totalLines={form.fields.length}
                    transactionType={form.transactionType}
                    disabled={form.isFormDisabled}
                    products={form.products}
                    locations={form.locations}
                    batches={form.batches}
                    control={form.control}
                    lineErrors={form.errors.lines?.[index]}
                    onProductChange={form.handleLineProductChange}
                    onRemove={form.handleRemoveLine}
                  />
                ))}
              </div>
              {form.canWriteAdjustments && (
                <div className="border-border flex flex-wrap items-center justify-end gap-2 border-t pt-4">
                  {form.editingDraftTxn ? (
                    <>
                      <Button
                        variant="secondary"
                        disabled={form.isSubmittingForm}
                        onClick={form.handleCancelEditDraft}
                      >
                        Cancel editing
                      </Button>
                      <Button
                        type="submit"
                        disabled={form.isSubmittingForm || !form.isDirty}
                        isLoading={form.isSubmittingForm}
                      >
                        Save draft changes
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="submit"
                      disabled={form.isSubmittingForm}
                      isLoading={form.isSubmittingForm}
                    >
                      Submit adjustment
                    </Button>
                  )}
                </div>
              )}
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
