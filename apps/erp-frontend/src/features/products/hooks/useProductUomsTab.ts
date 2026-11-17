import { useState } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../../../hooks/useAuth';
import { ApiClientError } from '../../../lib/api/client';
import type { ProductDto, ProductUomDto } from '../../../types/api';
import { usePatchProductUomMutation } from './useCatalogMutations';
import { useProductUomsQuery } from './useCatalogQueries';

export function formatCatalogApiError(
  error: unknown,
  fallback: string
): string {
  if (error instanceof ApiClientError) {
    return error.trace_id
      ? `${error.message} (Trace: ${error.trace_id})`
      : error.message;
  }
  return fallback;
}

export function useProductUomsTab(product: ProductDto) {
  const { hasAnyRole, can, runtime } = useAuth();
  const canWrite =
    hasAnyRole(['Admin', 'Pharmacist']) &&
    can('inventory:write') &&
    runtime === 'Cloud';
  const uomsQuery = useProductUomsQuery(product.product_id);
  const patchMutation = usePatchProductUomMutation();
  const [togglingIds, setTogglingIds] = useState<string[]>([]);
  const [modal, setModal] = useState<{
    open: boolean;
    uom: ProductUomDto | null;
  }>({ open: false, uom: null });
  const uoms = uomsQuery.data ?? [];
  const hasBaseUom = (uomsQuery.isSuccess ? uoms : product.uoms).some(
    (u) => u.is_base
  );

  const toggleActive = async (uom: ProductUomDto, next: boolean) => {
    const id = uom.product_uom_id;
    if (uom.is_base || !canWrite || togglingIds.includes(id)) return;
    setTogglingIds((p) => (p.includes(id) ? p : [...p, id]));
    try {
      await patchMutation.mutateAsync({
        productId: product.product_id,
        uomId: id,
        payload: { is_active: next },
      });
      toast.success(
        `UOM "${uom.uom_code}" marked ${next ? 'active' : 'inactive'}`
      );
    } catch (err) {
      toast.error(formatCatalogApiError(err, 'Unable to update UOM status.'));
    } finally {
      setTogglingIds((p) => p.filter((x) => x !== id));
    }
  };

  return {
    runtime,
    canWrite,
    uomsQuery,
    uoms,
    hasBaseUom,
    togglingIds,
    modal,
    openCreateModal: () => setModal({ open: true, uom: null }),
    openEditModal: (uom: ProductUomDto) => setModal({ open: true, uom }),
    closeModal: () => setModal({ open: false, uom: null }),
    toggleActive,
  };
}
