import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Input } from '../../../components/ui/Input';
import { Pagination } from '../../../components/ui/Pagination';
import { Select } from '../../../components/ui/Select';
import { Skeleton } from '../../../components/ui/Skeleton';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/Table';
import type { InventoryTxn } from '../../../types/api';
import {
  LEDGER_HEADERS,
  useLedgerHistoryState,
} from '../hooks/useLedgerHistoryState';
import { LedgerTxnDetailModal } from './LedgerTxnDetailModal';
import { LedgerTxnTableRow } from './LedgerTxnTableRow';

export interface LedgerHistoryTabProps {
  branchId: string;
  onRequestReversal?: (txn: InventoryTxn) => void;
}

export function LedgerHistoryTab({
  branchId,
  onRequestReversal,
}: LedgerHistoryTabProps) {
  const ledger = useLedgerHistoryState({ branchId, onRequestReversal });

  if (!ledger.canReadLedger || !branchId.trim()) {
    return (
      <Card>
        <CardHeader title="Inventory Ledger History" />
        {!ledger.canReadLedger ? (
          <div className="p-4">
            <Alert variant="warning" title="Access restricted">
              Inventory ledger history is available to Admin and Pharmacist
              roles with inventory read access only.
            </Alert>
          </div>
        ) : (
          <EmptyState
            title="Select a branch"
            description="Choose an active branch to view its inventory ledger history."
          />
        )}
      </Card>
    );
  }

  const txnsQuery = ledger.transactionsQuery;

  return (
    <Card>
      <CardHeader
        title="Inventory Ledger History"
        description="Read-only append-only ledger of all stock movements for the selected branch."
      />
      <div className="border-border grid grid-cols-1 gap-3 border-b p-4 md:grid-cols-2 lg:grid-cols-5">
        {ledger.filterSelects.map((f) => (
          <Select key={f.label} {...f} />
        ))}
        {ledger.filterDates.map((f) => (
          <Input key={f.label} type="date" {...f} />
        ))}
        <div className="flex items-end">
          <Button
            variant="secondary"
            fullWidth
            disabled={!ledger.hasActiveFilters}
            onClick={ledger.clearFilters}
          >
            Clear filters
          </Button>
        </div>
      </div>

      {txnsQuery.isError ? (
        <div className="p-4">
          <Alert variant="danger" title="Could not load ledger history">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{ledger.listErrorMessage}</span>
              <Button
                variant="secondary"
                isLoading={txnsQuery.isFetching}
                onClick={ledger.retryList}
              >
                Retry
              </Button>
            </div>
          </Alert>
        </div>
      ) : txnsQuery.isLoading ? (
        <div
          role="status"
          aria-busy="true"
          aria-label="Loading ledger history"
          className="flex flex-col gap-2 p-4"
        >
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : ledger.tableRows.length === 0 ? (
        <EmptyState
          title={ledger.emptyTitle}
          description={ledger.emptyDescription}
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {LEDGER_HEADERS.map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
                <TableHead numeric>Lines</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.tableRows.map(({ txn, createdByLabel }) => (
                <LedgerTxnTableRow
                  key={txn.inventory_txn_id}
                  txn={txn}
                  createdByLabel={createdByLabel}
                  onViewDetails={ledger.openDetailModal}
                />
              ))}
            </TableBody>
          </Table>
          <div className="border-border border-t px-4 py-3">
            <Pagination {...ledger.paginationProps} />
          </div>
        </>
      )}
      <LedgerTxnDetailModal {...ledger.detailModalProps} />
    </Card>
  );
}
