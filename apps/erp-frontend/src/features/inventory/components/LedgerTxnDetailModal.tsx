import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Modal } from '../../../components/ui/Modal';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/Table';
import type { InventoryTxn } from '../../../types/api';
import {
  buildLedgerTxnMetaRows,
  formatLedgerTxnLines,
  getTxnStatusBadgeVariant,
  getTxnTypeBadgeVariant,
  NUMERIC_LINE_HEADERS,
  type LedgerLookupFormatters,
} from '../hooks/useLedgerHistoryState';

export interface LedgerTxnDetailModalProps {
  open: boolean;
  txn: InventoryTxn | null;
  canWriteAdjustments: boolean;
  lookups: LedgerLookupFormatters;
  onClose: () => void;
  onReverseTransaction: (txn: InventoryTxn) => void;
}

export function LedgerTxnDetailModal({
  open,
  txn,
  canWriteAdjustments,
  lookups,
  onClose,
  onReverseTransaction,
}: LedgerTxnDetailModalProps) {
  const canReverse =
    txn !== null &&
    txn.status === 'POSTED' &&
    txn.transaction_type !== 'REVERSAL' &&
    canWriteAdjustments;
  const metaRows = txn
    ? buildLedgerTxnMetaRows(txn, lookups.getEmployeeLabel)
    : [];
  const lineRows = txn ? formatLedgerTxnLines(txn, lookups) : [];

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
          {canReverse ? (
            <Button variant="primary" onClick={() => onReverseTransaction(txn)}>
              Reverse transaction
            </Button>
          ) : null}
        </>
      }
    >
      {!txn ? (
        <EmptyState
          title="Transaction not found"
          description="Select a ledger transaction to inspect its lines."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {txn.status === 'POSTED' ? (
            <Alert variant="info" title="Immutable posted record">
              Posted ledger transactions are append-only. Corrections require a
              REVERSAL transaction.
            </Alert>
          ) : null}
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
              <div key={row.label} className={row.wrapClass}>
                <dt className="text-caption text-text-muted uppercase">
                  {row.label}
                </dt>
                <dd className={row.valueClass}>{row.value}</dd>
              </div>
            ))}
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
              {lineRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.product}</TableCell>
                  <TableCell>{row.location}</TableCell>
                  <TableCell className="font-mono">{row.batch}</TableCell>
                  <TableCell numeric>{row.entered}</TableCell>
                  <TableCell numeric>{row.conversion}</TableCell>
                  <TableCell numeric className="font-mono font-semibold">
                    {row.delta}
                  </TableCell>
                  <TableCell numeric>{row.cost}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Modal>
  );
}
