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
import type { InventoryTxnDto } from '../../../types/api';
import { useLedgerHistoryState } from '../hooks/useLedgerHistoryState';
import { LedgerTxnDetailModal } from './LedgerTxnDetailModal';
import { LedgerTxnTableRow } from './LedgerTxnTableRow';

const LEDGER_HEADERS = [
  'Transaction No',
  'Type',
  'Status',
  'Reason code',
  'Posted at',
  'Created by',
] as const;

export interface LedgerHistoryTabProps {
  branchId: string;
  onRequestReversal?: (txn: InventoryTxnDto) => void;
}

export function LedgerHistoryTab({
  branchId,
  onRequestReversal,
}: LedgerHistoryTabProps) {
  const ledger = useLedgerHistoryState({ branchId });

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
          <Select
            key={f.label}
            label={f.label}
            options={f.options}
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
          />
        ))}
        {ledger.filterDates.map((f) => (
          <Input
            key={f.label}
            label={f.label}
            type="date"
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
          />
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
                onClick={() => void txnsQuery.refetch()}
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
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : ledger.transactions.length === 0 ? (
        <EmptyState
          title={
            ledger.hasActiveFilters
              ? 'No matching ledger transactions'
              : 'No ledger transactions'
          }
          description={
            ledger.hasActiveFilters
              ? 'Adjust or clear the ledger filters to see transactions.'
              : 'No inventory ledger transactions have been recorded for this branch yet.'
          }
          action={
            ledger.hasActiveFilters ? (
              <Button variant="secondary" onClick={ledger.clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
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
              {ledger.transactions.map((txn) => (
                <LedgerTxnTableRow
                  key={txn.inventory_txn_id}
                  txn={txn}
                  createdByLabel={ledger.getEmployeeLabel(
                    txn.created_by_employee_id
                  )}
                  onViewDetails={ledger.openDetailModal}
                />
              ))}
            </TableBody>
          </Table>
          <div className="border-border border-t px-4 py-3">
            <Pagination
              page={ledger.pageIndex + 1}
              pageSize={ledger.pageSize}
              itemCount={
                ledger.pageIndex === 0 && !ledger.hasNextPage
                  ? ledger.transactions.length
                  : undefined
              }
              hasNextPage={ledger.hasNextPage}
              onPageChange={ledger.handlePageChange}
            />
          </div>
        </>
      )}

      <LedgerTxnDetailModal
        {...ledger.detailModalProps}
        onReverseTransaction={(txn) => {
          ledger.closeDetailModal();
          onRequestReversal?.(txn);
        }}
      />
    </Card>
  );
}
