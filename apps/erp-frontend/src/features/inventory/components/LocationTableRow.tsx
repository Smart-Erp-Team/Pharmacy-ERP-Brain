import { Pencil } from 'lucide-react';
import { Badge, type BadgeVariant } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { TableCell, TableRow } from '../../../components/ui/Table';
import { Toggle } from '../../../components/ui/Toggle';
import type { InventoryLocationDto, LocationType } from '../../../types/api';

export interface LocationTableRowProps {
  location: InventoryLocationDto;
  canWrite: boolean;
  isToggling: boolean;
  onEdit: (location: InventoryLocationDto) => void;
  onToggleActive: (location: InventoryLocationDto, nextActive: boolean) => void;
}

const LOCATION_TYPE_VARIANT: Record<LocationType, BadgeVariant> = {
  SELLABLE: 'success',
  QUARANTINE: 'warning',
  SCRAP: 'danger',
};

export function LocationTableRow({
  location,
  canWrite,
  isToggling,
  onEdit,
  onToggleActive,
}: LocationTableRowProps) {
  return (
    <TableRow>
      <TableCell className="font-mono font-semibold">
        {location.location_code}
      </TableCell>
      <TableCell className="font-medium">{location.name}</TableCell>
      <TableCell>
        <Badge variant={LOCATION_TYPE_VARIANT[location.location_type]}>
          {location.location_type}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={location.is_sellable ? 'info' : 'neutral'}>
          {location.is_sellable ? 'Sellable' : 'Non-sellable'}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={location.is_active ? 'success' : 'neutral'} dot>
          {location.is_active ? 'Active' : 'Inactive'}
        </Badge>
      </TableCell>
      {canWrite ? (
        <TableCell>
          <div className="flex items-center justify-end gap-3">
            <Toggle
              label={`Toggle ${location.location_code} active`}
              checked={location.is_active}
              onChange={(checked) => onToggleActive(location, checked)}
              disabled={isToggling}
            />
            <Button
              variant="secondary"
              leadingIcon={
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              }
              onClick={() => onEdit(location)}
              disabled={isToggling}
            >
              Edit
            </Button>
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  );
}
