import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Modal } from '../../../components/ui/Modal';
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
import {
  buildLedgerTxnMetaRows,
  formatSignedDelta,
  getTxnStatusBadgeVariant,
  getTxnTypeBadgeVariant,
  type LedgerLookupFormatters,
} from '../hooks/useLedgerHistoryState';
import { formatNumericDisplay } from '../schemas/inventoryAdjustmentSchema';

const NUMERIC_LINE_HEADERS = [
  'Entered qty',
  'Conversion',
  'Delta (base)',
  'Unit cost (base)',
] as const;

export interface LedgerTxnDetailModalProps {
  open: boolean;
  txn: InventoryTxnDto | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  isRetrying: boolean;
  canWriteAdjustments: boolean;
  lookups: LedgerLookupFormatters;
  onRetry: () => void;
  onClose: () => void;
  onReverseTransaction: (txn: InventoryTxnDto) => void;
}

export function LedgerTxnDetailModal({
  open,
  txn,
  isLoading,
  isError,
  errorMessage,
  isRetrying,
  canWriteAdjustments,
  lookups,
  onRetry,
  onClose,
  onReverseTransaction,
}: LedgerTxnDetailModalProps) {
  const canReverse = txn?.status === 'POSTED' && canWriteAdjustments;
  const metaRows = txn
    ? buildLedgerTxnMetaRows(txn, lookups.getEmployeeLabel)
    : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Ledger transaction"
      title={txn ? txn.transaction_no : 'Transaction details'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {canReverse && (
            <Button variant="primary" onClick={() => onReverseTransaction(txn)}>
              Reverse transaction
            </Button>
          )}
        </>
      }
    >
      {isLoading ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Loading transaction details"
          className="flex flex-col gap-3"
        >
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : isError ? (
        <Alert variant="danger" title="Could not load transaction details">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage ?? 'Unable to load transaction details.'}</span>
            <Button
              variant="secondary"
              isLoading={isRetrying}
              onClick={onRetry}
            >
              Retry
            </Button>
          </div>
        </Alert>
      ) : !txn ? (
        <EmptyState
          title="Transaction not found"
          description="Select a ledger transaction to inspect its lines."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {txn.status === 'POSTED' && (
            <Alert variant="info" title="Immutable posted record">
              Posted ledger transactions are append-only and cannot be edited or
              deleted. Corrections require a REVERSAL transaction.
            </Alert>
          )}
          <dl className="border-border bg-background grid grid-cols-2 gap-3 rounded-md border p-3">
            <div>
              <dt className="text-caption text-text-muted uppercase">Type</dt>
              <dd className="mt-1">
                <Badge variant={getTxnTypeBadgeVariant(txn.transaction_type)}>
                  {txn.transaction_type}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-muted uppercase">Status</dt>
              <dd className="mt-1">
                <Badge variant={getTxnStatusBadgeVariant(txn.status)} dot>
                  {txn.status}
                </Badge>
              </dd>
            </div>
            {metaRows.map((row) => (
              <div key={row.label}>
                <dt className="text-caption text-text-muted uppercase">
                  {row.label}
                </dt>
                <dd className="text-body-sm text-text mt-1">{row.value}</dd>
              </div>
            ))}
            {txn.reverses_inventory_txn_id && (
              <div className="col-span-2">
                <dt className="text-caption text-text-muted uppercase">
                  Reverses transaction
                </dt>
                <dd className="text-body-sm text-text mt-1 font-mono">
                  {txn.reverses_inventory_txn_id}
                </dd>
              </div>
            )}
          </dl>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Batch</TableHead>
                {NUMERIC_LINE_HEADERS.map((h) => (
                  <TableHead key={h} numeric>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {txn.lines.map((line) => (
                <TableRow key={line.inventory_txn_line_id}>
                  <TableCell>
                    {lookups.getProductLabel(line.product_id)}
                  </TableCell>
                  <TableCell>
                    {lookups.getLocationLabel(line.location_id)}
                  </TableCell>
                  <TableCell>{lookups.getBatchLabel(line.batch_id)}</TableCell>
                  <TableCell numeric>
                    {formatNumericDisplay(line.entered_qty)}{' '}
                    {lookups.getUomLabel(line.product_id, line.product_uom_id)}
                  </TableCell>
                  <TableCell numeric>
                    {formatNumericDisplay(line.conversion_snapshot)}
                  </TableCell>
                  <TableCell numeric className="font-mono font-semibold">
                    {formatSignedDelta(line.quantity_delta_base)}
                  </TableCell>
                  <TableCell numeric>
                    {formatNumericDisplay(line.unit_cost_base)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Modal>
  );
}
