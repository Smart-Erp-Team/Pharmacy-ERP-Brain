import { Pencil } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { TableCell, TableRow } from '../../../components/ui/Table';
import { Toggle } from '../../../components/ui/Toggle';
import type { ProductUom } from '../../../types/api';

export interface ProductUomTableRowProps {
  uom: ProductUom;
  canWrite: boolean;
  isToggling: boolean;
  onToggleActive: (uom: ProductUom, next: boolean) => void;
  onEdit: (uom: ProductUom) => void;
}

const fmtFactor = (value: number): string =>
  Number.isFinite(value) ? String(Number(value.toPrecision(12))) : '—';

const fmtPrice = (value: number | null | undefined): string | null => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const clean = String(Number(value.toPrecision(12)));
  const [intPart = '0', fracPart = ''] = clean.split('.');
  return `EGP ${intPart}.${fracPart.length <= 2 ? fracPart.padEnd(2, '0') : fracPart}`;
};

export function ProductUomTableRow({
  uom,
  canWrite,
  isToggling,
  onToggleActive,
  onEdit,
}: ProductUomTableRowProps) {
  const price = fmtPrice(uom.sale_unit_price);

  return (
    <TableRow>
      <TableCell className="text-text font-mono font-semibold">
        {uom.uom_code}
      </TableCell>
      <TableCell className="font-medium">{uom.display_name}</TableCell>
      <TableCell>
        {uom.is_base ? (
          <Badge variant="info">Base unit</Badge>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </TableCell>
      <TableCell numeric className="font-mono">
        {fmtFactor(uom.conversion_to_base)}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          {uom.is_sellable && <Badge variant="info">Sellable</Badge>}
          {uom.is_purchasable && <Badge variant="neutral">Purchasable</Badge>}
          {!uom.is_sellable && !uom.is_purchasable && (
            <Badge variant="neutral">Inactive flags</Badge>
          )}
        </div>
      </TableCell>
      <TableCell numeric className="font-mono">
        {price ?? (
          <span className="text-text-muted font-sans italic">Unavailable</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <Badge variant={uom.is_active ? 'success' : 'neutral'} dot>
            {uom.is_active ? 'Active' : 'Inactive'}
          </Badge>
          <Toggle
            label={`Toggle status for ${uom.uom_code}`}
            checked={uom.is_active}
            disabled={uom.is_base || !canWrite || isToggling}
            onChange={(next) => onToggleActive(uom, next)}
          />
        </div>
      </TableCell>
      {canWrite && (
        <TableCell>
          <Button
            variant="secondary"
            leadingIcon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => onEdit(uom)}
          >
            Edit
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}
