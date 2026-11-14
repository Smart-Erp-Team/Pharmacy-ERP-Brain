import { Alert } from '../../../components/ui/Alert';
import { Card, CardHeader } from '../../../components/ui/Card';
import { PageHeading } from '../../../components/ui/PageHeading';

/**
 * Product catalog (DESIGN.md §5.2 and §5.4): a master-detail layout with the
 * product list on the left and the categories tree on the right.
 */
export function ProductsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        eyebrow="Operations"
        title="Products"
        description="Product catalog, units of measure, prices and the category tree."
      />

      <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(350px,1fr)] gap-4">
        <Card>
          <CardHeader
            title="Product list"
            description="Search by product, SKU or barcode, with the category and stock filters."
          />
          <div className="p-4">
            <Alert variant="info" title="Awaiting connected data">
              Products are not connected yet. The toolbar, the sortable table
              and the pagination arrive with the catalog API — no product is
              listed until the server answers.
            </Alert>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Categories"
            description="The category tree with its add and edit actions."
          />
          <div className="p-4">
            <Alert variant="info" title="Awaiting connected data">
              Categories are not connected yet — the tree stays empty until the
              server answers.
            </Alert>
          </div>
        </Card>
      </div>
    </div>
  );
}
