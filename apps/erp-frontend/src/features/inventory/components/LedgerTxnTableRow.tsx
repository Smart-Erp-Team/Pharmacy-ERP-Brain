import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { TableCell, TableRow } from '../../../components/ui/Table';
import type { InventoryTxn } from '../../../types/api';
import {
  formatUtcTimestamp,
  getTxnStatusBadgeVariant,
  getTxnTypeBadgeVariant,
} from '../hooks/useLedgerHistoryState';

export interface LedgerTxnTableRowProps {
  txn: InventoryTxn;
  createdByLabel: string;
  onViewDetails: (txn: InventoryTxn) => void;
}

export function LedgerTxnTableRow({
  txn,
  createdByLabel,
  onViewDetails,
}: LedgerTxnTableRowProps) {
  return (
    <TableRow>
      <TableCell className="font-mono font-semibold">
        {txn.transaction_no}
      </TableCell>
      <TableCell>
        <Badge variant={getTxnTypeBadgeVariant(txn.transaction_type)}>
          {txn.transaction_type}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={getTxnStatusBadgeVariant(txn.status)} dot>
          {txn.status}
        </Badge>
      </TableCell>
      <TableCell>{txn.reason_code?.trim() || 'Unavailable'}</TableCell>
      <TableCell>
        {txn.posted_at ? formatUtcTimestamp(txn.posted_at) : 'Unavailable'}
      </TableCell>
      <TableCell>{createdByLabel}</TableCell>
      <TableCell numeric>{txn.lines.length}</TableCell>
      <TableCell>
        <Button variant="secondary" onClick={() => onViewDetails(txn)}>
          View details
        </Button>
      </TableCell>
    </TableRow>
  );
}
