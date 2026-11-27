import { useState } from 'react';
import { PageHeading } from '../../../components/ui/PageHeading';
import { Tabs } from '../../../components/ui/Tabs';
import type { InventoryTxn } from '../../../types/api';
import { InventoryBranchBar } from '../components/InventoryBranchBar';
import { LedgerHistoryTab } from '../components/LedgerHistoryTab';
import { StockAdjustmentsTab } from '../components/StockAdjustmentsTab';
import { StockBalancesTab } from '../components/StockBalancesTab';
import { StockOverviewTab } from '../components/StockOverviewTab';
import { StorageLocationsTab } from '../components/StorageLocationsTab';
import { useInventoryBranchState } from '../hooks/useInventoryBranchState';

/**
 * Inventory (Stage 1, Contract-First): balances & FEFO batches,
 * storage locations, BranchLocal atomic adjustments & opening balances, and
 * append-only ledger history.
 */
export function InventoryPage() {
  const branchState = useInventoryBranchState();
  const [activeTab, setActiveTab] = useState<string>(
    'Stock Balances & Batches'
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow="Operations"
        title="Inventory"
        description="Stock balances, FEFO batches, storage locations, adjustments, and ledger history for the selected branch."
      />

      <InventoryBranchBar
        branchId={branchState.branchId}
        branchOptions={branchState.branchOptions}
        isLoading={branchState.isBranchesLoading}
        error={branchState.branchesError}
        onSelectBranch={branchState.onSelectBranch}
        onRetry={branchState.onRetryBranches}
      />

      <BranchInventory
        key={branchState.branchId}
        branchState={branchState}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    </div>
  );
}

function BranchInventory({
  branchState,
  activeTab,
  setActiveTab,
}: {
  branchState: ReturnType<typeof useInventoryBranchState>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}) {
  const [pendingReversalTxn, setPendingReversalTxn] =
    useState<InventoryTxn | null>(null);

  const visibleTabs: string[] = [
    'Stock Overview',
    'Stock Balances & Batches',
    'Storage Locations',
    ...(branchState.canReadLedger
      ? ['Stock Adjustments & Opening Balance', 'Inventory Ledger History']
      : []),
  ];

  const currentTab = visibleTabs.includes(activeTab)
    ? activeTab
    : 'Stock Balances & Batches';

  return (
    <>
      <Tabs
        labels={visibleTabs}
        activeLabel={currentTab}
        onChange={setActiveTab}
      />

      {currentTab === 'Stock Overview' ? (
        <StockOverviewTab
          branchId={branchState.branchId}
          branchName={branchState.branchName}
        />
      ) : currentTab === 'Stock Balances & Batches' ? (
        <StockBalancesTab branchId={branchState.branchId} />
      ) : currentTab === 'Storage Locations' ? (
        <StorageLocationsTab branchId={branchState.branchId} />
      ) : currentTab === 'Stock Adjustments & Opening Balance' &&
        branchState.canReadLedger ? (
        <StockAdjustmentsTab
          branchId={branchState.branchId}
          initialReversalTxn={pendingReversalTxn}
          onClearReversal={() => setPendingReversalTxn(null)}
        />
      ) : currentTab === 'Inventory Ledger History' &&
        branchState.canReadLedger ? (
        <LedgerHistoryTab
          branchId={branchState.branchId}
          onRequestReversal={(txn) => {
            setPendingReversalTxn(txn);
            setActiveTab('Stock Adjustments & Opening Balance');
          }}
        />
      ) : null}
    </>
  );
}
