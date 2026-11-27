import { KeyRound, Pencil } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { TableCell, TableRow } from '../../../components/ui/Table';
import { Toggle } from '../../../components/ui/Toggle';
import type { Branch } from '../../../types/api';

export interface BranchTableRowProps {
  branch: Branch;
  isToggling: boolean;
  onEdit: (branch: Branch) => void;
  onToggleActive: (branch: Branch, nextActive: boolean) => void;
  onGenerateToken: (branch: Branch) => void;
}

export function BranchTableRow({
  branch,
  isToggling,
  onEdit,
  onToggleActive,
  onGenerateToken,
}: BranchTableRowProps) {
  const locationText = `${branch.address.city}, ${branch.address.country_code}`;

  return (
    <TableRow>
      <TableCell className="text-text font-mono font-semibold">
        {branch.branch_code}
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="text-text font-semibold">{branch.name}</span>
          {branch.address.line1 ? (
            <span className="text-body-sm text-text-muted">
              {branch.address.line1}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-text-secondary">{locationText}</TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <Badge variant={branch.is_active ? 'success' : 'neutral'} dot>
            {branch.is_active ? 'Active' : 'Inactive'}
          </Badge>
          <Toggle
            label={`Toggle status for ${branch.name}`}
            checked={branch.is_active}
            disabled={isToggling}
            onChange={(nextActive) => onToggleActive(branch, nextActive)}
          />
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => onEdit(branch)}
            leadingIcon={<Pencil className="h-3.5 w-3.5" />}
          >
            Edit
          </Button>
          <Button
            variant="secondary"
            onClick={() => onGenerateToken(branch)}
            disabled={!branch.is_active}
            title={
              branch.is_active
                ? 'Generate single-use device enrollment token'
                : 'Activate branch before issuing an enrollment token'
            }
            leadingIcon={<KeyRound className="h-3.5 w-3.5" />}
          >
            Enrollment token
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
