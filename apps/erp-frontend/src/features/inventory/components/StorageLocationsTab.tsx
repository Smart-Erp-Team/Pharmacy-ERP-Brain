import { Plus } from 'lucide-react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
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
import { Toggle } from '../../../components/ui/Toggle';
import {
  STORAGE_LOCATIONS_PAGE_SIZE,
  useStorageLocationsState,
  type LocationFilter,
} from '../hooks/useInventoryBranchState';
import { LocationFormModal } from './LocationFormModal';
import { LocationTableRow } from './LocationTableRow';

export interface StorageLocationsTabProps {
  branchId: string;
}

const TYPE_OPTIONS = [
  { value: 'ALL', label: 'All types' },
  { value: 'SELLABLE', label: 'SELLABLE' },
  { value: 'QUARANTINE', label: 'QUARANTINE' },
  { value: 'SCRAP', label: 'SCRAP' },
] as const;

export function StorageLocationsTab({ branchId }: StorageLocationsTabProps) {
  const state = useStorageLocationsState(branchId);

  return (
    <Card>
      <CardHeader
        title="Storage Locations"
        description="Manage sellable shelves, quarantine cages, and scrap bins for this branch."
        action={
          state.canWrite ? (
            <Button
              leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
              onClick={state.openCreateModal}
            >
              Add Location
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-4 p-4">
        {!state.canWrite ? (
          <Alert variant="info" title="Read-only access">
            Your role can inspect branch storage locations, but only Admins and
            Pharmacists with inventory write permission can create or update
            them.
          </Alert>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="w-full sm:w-56">
            <Select
              label="Location type"
              options={TYPE_OPTIONS}
              value={state.locationType}
              onChange={(e) =>
                state.setLocationType(e.target.value as LocationFilter)
              }
            />
          </div>
          <Toggle
            label="Include inactive"
            checked={state.includeInactive}
            onChange={state.setIncludeInactive}
          />
        </div>

        {state.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : state.isError ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Alert variant="danger" title="Could not load storage locations">
              Unable to load storage locations for this branch.
            </Alert>
            <Button variant="secondary" onClick={state.retry}>
              Retry
            </Button>
          </div>
        ) : state.locations.length === 0 ? (
          <EmptyState
            title="No storage locations found"
            description="No locations match your current filter criteria."
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Sellable</TableHead>
                  <TableHead>Status</TableHead>
                  {state.canWrite ? (
                    <TableHead className="text-right">Actions</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.locations.map((location) => (
                  <LocationTableRow
                    key={location.location_id}
                    location={location}
                    canWrite={state.canWrite}
                    isToggling={state.togglingIds.includes(
                      location.location_id
                    )}
                    onEdit={state.openEditModal}
                    onToggleActive={state.handleToggleActive}
                  />
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={state.page}
              pageSize={STORAGE_LOCATIONS_PAGE_SIZE}
              hasNextPage={state.hasNextPage}
              onPageChange={state.handlePageChange}
            />
          </>
        )}
      </div>

      <LocationFormModal
        open={state.modal.open}
        branchId={branchId}
        location={state.modal.location}
        onClose={state.closeModal}
      />
    </Card>
  );
}
