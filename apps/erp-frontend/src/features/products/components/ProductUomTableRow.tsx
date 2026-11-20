import { Pencil } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { TableCell, TableRow } from '../../../components/ui/Table';
import { Toggle } from '../../../components/ui/Toggle';
import type { ProductUomDto } from '../../../types/api';

export interface ProductUomTableRowProps {
  uom: ProductUomDto;
  canWrite: boolean;
  isToggling: boolean;
  onToggleActive: (uom: ProductUomDto, next: boolean) => void;
  onEdit: (uom: ProductUomDto) => void;
}

const fmtFactor = (v: string) => {
  const c = v.trim().includes('.') ? v.trim().replace(/\.?0+$/, '') : v.trim();
  return c.startsWith('.') ? `0${c}` : c;
};

const fmtPrice = (v: string | null | undefined): string | null => {
  const t = v?.trim() ?? '';
  if (!t) return null;
  const [rawInt = '0', frac = ''] = t.split('.');
  const i = rawInt.replace(/^0+(?=\d)/, '') || '0';
  return `EGP ${i}.${frac.slice(0, 2).padEnd(2, '0')}${frac.slice(2).replace(/0+$/, '')}`;
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
