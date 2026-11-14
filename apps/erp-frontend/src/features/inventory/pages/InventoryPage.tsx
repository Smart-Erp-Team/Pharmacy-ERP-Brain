import { useState } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Card, CardHeader } from '../../../components/ui/Card';
import { PageHeading } from '../../../components/ui/PageHeading';
import { Tabs } from '../../../components/ui/Tabs';

const INVENTORY_TABS = [
  'Stock Overview',
  'Stock Balances & Batches',
  'Stock Adjustments & Opening Balance',
  'Inventory Ledger History',
] as const;

/**
 * Inventory (DESIGN.md §5.6): balances and batches, stock adjustments and the
 * append-only ledger history.
 */
export function InventoryPage() {
  const [activeTab, setActiveTab] = useState<string>(
    'Stock Balances & Batches'
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow="Operations"
        title="Inventory"
        description="Stock balances, batches, adjustments and the ledger history for the active branch."
      />

      <Tabs
        labels={INVENTORY_TABS}
        activeLabel={activeTab}
        onChange={setActiveTab}
      />

      <Card>
        <CardHeader
          title={activeTab}
          description="Balances, quantities and costs come from the inventory API."
        />
        <div className="p-4">
          <Alert variant="info" title="Awaiting connected data">
            Inventory data is not connected yet. Quantities and costs stay
            &ldquo;Unavailable&rdquo; until the server answers — they are never
            shown as zero.
          </Alert>
        </div>
      </Card>
    </div>
  );
}
