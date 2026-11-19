import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/Table';
import type { InventoryTxnDto } from '../../../types/api';
import type { ActiveDraftAction } from '../hooks/useAdjustmentForm';
import { getTxnTypeBadgeVariant } from '../hooks/useLedgerHistoryState';

export interface DraftAdjustmentsListProps {
  drafts: readonly InventoryTxnDto[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  isRetrying: boolean;
  canWriteAdjustments: boolean;
  editingTxnId: string | null;
  activeAction: ActiveDraftAction | null;
  isBusy: boolean;
  actionError: string | null;
  onRetry: () => void;
  onEditDraft: (txn: InventoryTxnDto) => void;
  onPostDraft: (txn: InventoryTxnDto) => void;
  onCancelDraft: (txn: InventoryTxnDto) => void;
}

export function DraftAdjustmentsList({
  drafts,
  isLoading,
  isError,
  errorMessage,
  isRetrying,
  canWriteAdjustments,
  editingTxnId,
  activeAction,
  isBusy,
  actionError,
  onRetry,
  onEditDraft,
  onPostDraft,
  onCancelDraft,
}: DraftAdjustmentsListProps) {
  return (
    <Card>
      <CardHeader
        title="Draft adjustments"
        description="Unposted draft adjustments in this branch can be edited, posted, or cancelled."
      />
      {actionError && (
        <div className="border-border border-b p-4">
          <Alert variant="danger" title="Draft action failed">
            {actionError}
          </Alert>
        </div>
      )}
      {isError ? (
        <div className="p-4">
          <Alert variant="danger" title="Could not load draft adjustments">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{errorMessage ?? 'Unable to load draft adjustments.'}</span>
              <Button
                variant="secondary"
                isLoading={isRetrying}
                onClick={onRetry}
              >
                Retry
              </Button>
            </div>
          </Alert>
        </div>
      ) : isLoading ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Loading draft adjustments"
          className="flex flex-col gap-2 p-4"
        >
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : drafts.length === 0 ? (
        <EmptyState
          title="No draft adjustments"
          description="Unposted draft adjustments for this branch will appear here."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transaction No</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reason code</TableHead>
              <TableHead numeric>Lines</TableHead>
              {canWriteAdjustments && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {drafts.map((txn) => {
              const posting =
                activeAction?.txnId === txn.inventory_txn_id &&
                activeAction.type === 'post';
              const cancelling =
                activeAction?.txnId === txn.inventory_txn_id &&
                activeAction.type === 'cancel';
              return (
                <TableRow key={txn.inventory_txn_id}>
                  <TableCell className="font-mono font-semibold">
                    {txn.transaction_no}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={getTxnTypeBadgeVariant(txn.transaction_type)}
                    >
                      {txn.transaction_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="warning" dot>
                      {txn.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{txn.reason_code ?? 'Unavailable'}</TableCell>
                  <TableCell numeric>{txn.lines.length}</TableCell>
                  {canWriteAdjustments && (
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          disabled={
                            isBusy || editingTxnId === txn.inventory_txn_id
                          }
                          onClick={() => onEditDraft(txn)}
                        >
                          Edit draft
                        </Button>
                        <Button
                          variant="primary"
                          isLoading={posting}
                          disabled={isBusy}
                          onClick={() => onPostDraft(txn)}
                        >
                          Post adjustment
                        </Button>
                        <Button
                          variant="danger"
                          isLoading={cancelling}
                          disabled={isBusy}
                          onClick={() => onCancelDraft(txn)}
                        >
                          Cancel draft
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
