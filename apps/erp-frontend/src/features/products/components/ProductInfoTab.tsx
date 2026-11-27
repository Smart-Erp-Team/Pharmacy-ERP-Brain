import { Badge } from '../../../components/ui/Badge';
import { Card, CardHeader } from '../../../components/ui/Card';
import type { Product, ProductCategory } from '../../../types/api';
import { taxRateDtoToPercentString } from '../schemas/productSchema';

export interface ProductInfoTabProps {
  product: Product;
  categories: readonly ProductCategory[];
}

function formatTimestamp(value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatBasePrice(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const clean = String(Number(value.toPrecision(12)));
  const [intPart = '0', fracPart = ''] = clean.split('.');
  return `EGP ${intPart}.${fracPart.length <= 2 ? fracPart.padEnd(2, '0') : fracPart}`;
}

function renderOptionalText(value: string | null | undefined, mono = false) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return <span className="text-text-muted italic">Unavailable</span>;
  }
  return (
    <span className={mono ? 'text-text font-mono break-all' : 'text-text'}>
      {trimmed}
    </span>
  );
}

export function ProductInfoTab({ product, categories }: ProductInfoTabProps) {
  const category = categories.find(
    (item) => item.category_id === product.category_id
  );
  const baseUom =
    product.uoms.find((u) => u.is_base) ??
    product.uoms.find((u) => u.uom_code === product.base_uom_code);
  const basePrice = formatBasePrice(baseUom?.sale_unit_price);
  const taxPercent = taxRateDtoToPercentString(product.tax_rate);
  const createdAt = formatTimestamp(product.created_at);
  const updatedAt = formatTimestamp(product.updated_at);

  const items = [
    {
      label: 'SKU',
      value: <span className="text-text font-mono">{product.sku}</span>,
    },
    {
      label: 'Base UOM',
      value: (
        <span className="text-text font-mono">{product.base_uom_code}</span>
      ),
    },
    {
      label: 'Base price',
      value: renderOptionalText(basePrice, true),
    },
    {
      label: 'Category',
      value: category ? (
        <span className="text-text">{category.name}</span>
      ) : (
        <span className="text-text-muted italic">Category unavailable</span>
      ),
    },
    {
      label: 'Tax rate',
      value: (
        <span className="text-text inline-flex items-baseline gap-1.5">
          <span>{taxPercent}%</span>
          <span className="text-body-sm text-text-muted font-mono">
            ({product.tax_rate})
          </span>
        </span>
      ),
    },
    {
      label: 'Lot tracking',
      value: (
        <Badge variant={product.lot_tracking_required ? 'info' : 'neutral'}>
          {product.lot_tracking_required ? 'Required' : 'Not required'}
        </Badge>
      ),
    },
    {
      label: 'Expiry alert days',
      value: (
        <span className="text-text">{product.expiry_alert_days} days</span>
      ),
    },
    { label: 'Barcode', value: renderOptionalText(product.barcode, true) },
    { label: 'Generic name', value: renderOptionalText(product.generic_name) },
    { label: 'Brand name', value: renderOptionalText(product.brand_name) },
    { label: 'Image URL', value: renderOptionalText(product.image_url, true) },
    { label: 'Created at', value: renderOptionalText(createdAt) },
    { label: 'Updated at', value: renderOptionalText(updatedAt) },
  ];

  return (
    <Card>
      <CardHeader
        title="Product Information"
        description="Authoritative catalog attributes, tax configuration, and tracking policy."
      />
      <dl className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-1">
            <dt className="text-caption text-text-muted font-semibold tracking-wide uppercase">
              {item.label}
            </dt>
            <dd className="text-body font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
