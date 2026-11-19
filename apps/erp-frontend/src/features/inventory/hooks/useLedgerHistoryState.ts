import { useMemo, useState } from 'react';
import {
  useEmployeesQuery,
  type EmployeeDto,
} from '../../../features/employees';
import { useProductsQuery, type ProductDto } from '../../../features/products';
import { useAuth } from '../../../hooks/useAuth';
import { ApiClientError } from '../../../lib/api/client';
import type {
  InventoryBatchDto,
  InventoryLocationDto,
  InventoryTxnStatus,
  InventoryTxnType,
} from '../../../types/api';
import { formatNumericDisplay } from '../schemas/inventoryAdjustmentSchema';
import {
  useInventoryBatchesQuery,
  useInventoryLocationsQuery,
  useInventoryTransactionQuery,
  useInventoryTransactionsQuery,
} from './useInventoryQueries';

export const LEDGER_PAGE_SIZE = 20;

export const LEDGER_TXN_TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'OPENING_BALANCE', label: 'Opening balance' },
  { value: 'ADJUSTMENT_IN', label: 'Adjustment in' },
  { value: 'ADJUSTMENT_OUT', label: 'Adjustment out' },
  { value: 'SALE_ISSUE', label: 'Sale issue' },
  { value: 'SALES_RETURN_IN', label: 'Sales return in' },
  { value: 'PURCHASE_RECEIPT', label: 'Purchase receipt' },
  { value: 'VENDOR_RETURN_OUT', label: 'Vendor return out' },
  { value: 'SCRAP_OUT', label: 'Scrap out' },
  { value: 'REVERSAL', label: 'Reversal' },
] as const;

const VALID_TXN_TYPES: ReadonlySet<string> = new Set<InventoryTxnType>([
  'OPENING_BALANCE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'SALE_ISSUE',
  'SALES_RETURN_IN',
  'PURCHASE_RECEIPT',
  'VENDOR_RETURN_OUT',
  'SCRAP_OUT',
  'REVERSAL',
]);

function isInventoryTxnType(value: string): value is InventoryTxnType {
  return VALID_TXN_TYPES.has(value);
}

function normalizeDateBoundary(
  raw: string,
  isEnd: boolean
): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return isEnd ? `${trimmed}T23:59:59.999Z` : `${trimmed}T00:00:00.000Z`;
  }
  return trimmed;
}

export function formatInventoryApiError(
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

export function formatUtcTimestamp(value: string | null | undefined): string {
  if (!value || !value.trim()) {
    return 'Unavailable';
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    return 'Unavailable';
  }
  const formatted = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  }).format(new Date(ms));
  return `${formatted} UTC`;
}

export function formatSignedDelta(value: string | null | undefined): string {
  if (!value || !value.trim()) {
    return 'Unavailable';
  }
  const trimmed = value.trim();
  const formatted = formatNumericDisplay(trimmed);
  if (formatted === 'Unavailable') {
    return 'Unavailable';
  }
  return trimmed.startsWith('-') ? formatted : `+${formatted}`;
}

export function getTxnStatusBadgeVariant(
  status: InventoryTxnStatus
): 'success' | 'warning' | 'neutral' {
  switch (status) {
    case 'POSTED':
      return 'success';
    case 'DRAFT':
      return 'warning';
    case 'CANCELLED':
      return 'neutral';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function getTxnTypeBadgeVariant(
  txnType: InventoryTxnType
): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  switch (txnType) {
    case 'OPENING_BALANCE':
    case 'SALES_RETURN_IN':
      return 'info';
    case 'ADJUSTMENT_IN':
    case 'PURCHASE_RECEIPT':
      return 'success';
    case 'ADJUSTMENT_OUT':
    case 'VENDOR_RETURN_OUT':
      return 'warning';
    case 'REVERSAL':
    case 'SCRAP_OUT':
      return 'danger';
    case 'SALE_ISSUE':
      return 'neutral';
    default: {
      const exhaustive: never = txnType;
      return exhaustive;
    }
  }
}

export interface LedgerLookupFormatters {
  getProductLabel: (productId: string) => string;
  getLocationLabel: (locationId: string) => string;
  getBatchLabel: (batchId: string) => string;
  getEmployeeLabel: (employeeId?: string | null) => string;
  getUomLabel: (productId: string, uomId: string) => string;
}

export function buildLedgerTxnMetaRows(
  txn: {
    reason_code?: string | null;
    posted_at?: string | null;
    created_by_employee_id?: string;
    note?: string | null;
  },
  getEmployeeLabel: (employeeId?: string | null) => string
) {
  return [
    { label: 'Reason code', value: txn.reason_code?.trim() || 'Unavailable' },
    {
      label: 'Posted at',
      value: txn.posted_at ? formatUtcTimestamp(txn.posted_at) : 'Unavailable',
    },
    {
      label: 'Created by',
      value: getEmployeeLabel(txn.created_by_employee_id),
    },
    { label: 'Note', value: txn.note?.trim() || 'None' },
  ];
}

export interface UseLedgerHistoryStateOptions {
  branchId: string;
  pageSize?: number;
}

export function useLedgerHistoryState({
  branchId,
  pageSize = LEDGER_PAGE_SIZE,
}: UseLedgerHistoryStateOptions) {
  const { hasRole, hasAnyRole, can, runtime } = useAuth();
  const canReadLedger =
    hasAnyRole(['Admin', 'Pharmacist']) && can('inventory:read');
  const canWriteAdjustments =
    hasAnyRole(['Admin', 'Pharmacist']) &&
    can('inventory:write') &&
    runtime === 'BranchLocal';
  const canReadEmployees =
    canReadLedger && hasRole('Admin') && can('user:admin');

  const [prevBranchId, setPrevBranchId] = useState(branchId);
  const [transactionType, setTransactionType] = useState<InventoryTxnType | ''>(
    ''
  );
  const [productId, setProductId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null);

  if (branchId !== prevBranchId) {
    setPrevBranchId(branchId);
    setCursorStack([undefined]);
    setPageIndex(0);
    setSelectedTxnId(null);
  }

  const normalizedFrom = normalizeDateBoundary(from, false);
  const normalizedTo = normalizeDateBoundary(to, true);

  const transactionsQuery = useInventoryTransactionsQuery(
    {
      branchId,
      cursor: cursorStack[pageIndex],
      limit: pageSize,
      transactionType: transactionType || undefined,
      productId: productId || undefined,
      from: normalizedFrom,
      to: normalizedTo,
    },
    { enabled: canReadLedger }
  );

  const selectedTxnQuery = useInventoryTransactionQuery(selectedTxnId, {
    enabled: canReadLedger && Boolean(selectedTxnId),
  });

  const productsQuery = useProductsQuery(
    { includeInactive: true, limit: 200 },
    { enabled: canReadLedger }
  );

  const locationsQuery = useInventoryLocationsQuery(
    { branchId, includeInactive: true, limit: 200 },
    { enabled: canReadLedger }
  );

  const batchesQuery = useInventoryBatchesQuery(
    { branchId, limit: 200 },
    { enabled: canReadLedger }
  );

  const employeesQuery = useEmployeesQuery(
    { limit: 200 },
    { enabled: canReadEmployees }
  );

  const transactions = useMemo(
    () => transactionsQuery.data?.items ?? [],
    [transactionsQuery.data?.items]
  );

  const products = useMemo(
    () => productsQuery.data?.items ?? [],
    [productsQuery.data?.items]
  );

  const productsById = useMemo(() => {
    const map = new Map<string, ProductDto>();
    for (const item of products) {
      map.set(item.product_id, item);
    }
    return map;
  }, [products]);

  const locationsById = useMemo(() => {
    const map = new Map<string, InventoryLocationDto>();
    for (const loc of locationsQuery.data?.items ?? []) {
      map.set(loc.location_id, loc);
    }
    return map;
  }, [locationsQuery.data?.items]);

  const batchesById = useMemo(() => {
    const map = new Map<string, InventoryBatchDto>();
    for (const batch of batchesQuery.data?.items ?? []) {
      map.set(batch.batch_id, batch);
    }
    return map;
  }, [batchesQuery.data?.items]);

  const employeesById = useMemo(() => {
    const map = new Map<string, EmployeeDto>();
    for (const emp of employeesQuery.data?.items ?? []) {
      map.set(emp.employee_id, emp);
    }
    return map;
  }, [employeesQuery.data?.items]);

  const getProductLabel = (id: string): string => {
    const product = productsById.get(id);
    return product ? `${product.name} (${product.sku})` : 'Unavailable';
  };

  const getLocationLabel = (id: string): string => {
    const loc = locationsById.get(id);
    return loc ? `${loc.name} (${loc.location_code})` : 'Unavailable';
  };

  const getBatchLabel = (id: string): string => {
    const batch = batchesById.get(id);
    if (!batch) {
      return 'Unavailable';
    }
    return batch.is_non_lot || batch.batch_number === 'NON-LOT'
      ? 'NON-LOT'
      : batch.batch_number;
  };

  const getEmployeeLabel = (id: string | null | undefined): string => {
    const trimmed = id?.trim() ?? '';
    if (!trimmed) {
      return 'Unavailable';
    }
    if (canReadEmployees) {
      const employee = employeesById.get(trimmed);
      if (employee) {
        return employee.full_name;
      }
    }
    return `Employee ${trimmed.slice(0, 8)}`;
  };

  const getUomLabel = (prodId: string, uomId: string): string => {
    const product = productsById.get(prodId);
    const uom = product?.uoms.find((u) => u.product_uom_id === uomId);
    if (uom) {
      return uom.uom_code;
    }
    return product?.base_uom_code ?? 'Unavailable';
  };

  const resetPagination = () => {
    setCursorStack([undefined]);
    setPageIndex(0);
  };

  const handleTransactionTypeChange = (nextValue: string) => {
    setTransactionType(isInventoryTxnType(nextValue) ? nextValue : '');
    resetPagination();
  };

  const handleProductChange = (nextProductId: string) => {
    setProductId(nextProductId);
    resetPagination();
  };

  const handleFromChange = (nextFrom: string) => {
    setFrom(nextFrom);
    resetPagination();
  };

  const handleToChange = (nextTo: string) => {
    setTo(nextTo);
    resetPagination();
  };

  const clearFilters = () => {
    setTransactionType('');
    setProductId('');
    setFrom('');
    setTo('');
    resetPagination();
  };

  const handlePageChange = (nextPage: number) => {
    const nextIndex = nextPage - 1;
    if (nextIndex < 0) {
      return;
    }
    if (nextIndex < pageIndex && nextIndex < cursorStack.length) {
      setPageIndex(nextIndex);
      return;
    }
    if (nextIndex === pageIndex + 1) {
      const nextCursor = transactionsQuery.data?.nextCursor;
      if (nextCursor) {
        setCursorStack((prev) => [...prev.slice(0, nextIndex), nextCursor]);
        setPageIndex(nextIndex);
      }
    }
  };

  const hasActiveFilters = Boolean(transactionType || productId || from || to);
  const hasNextPage = Boolean(transactionsQuery.data?.nextCursor);
  const productOptions = useMemo(
    () => [
      { value: '', label: 'All products' },
      ...products.map((p) => ({
        value: p.product_id,
        label: `${p.name} (${p.sku})`,
      })),
    ],
    [products]
  );

  const lookups: LedgerLookupFormatters = {
    getProductLabel,
    getLocationLabel,
    getBatchLabel,
    getEmployeeLabel,
    getUomLabel,
  };

  const detailErrorMessage = selectedTxnQuery.isError
    ? formatInventoryApiError(
        selectedTxnQuery.error,
        'Unable to load transaction details.'
      )
    : undefined;

  const filterSelects = [
    {
      label: 'Transaction type',
      options: LEDGER_TXN_TYPE_OPTIONS,
      value: transactionType,
      onChange: handleTransactionTypeChange,
    },
    {
      label: 'Product',
      options: productOptions,
      value: productId,
      onChange: handleProductChange,
    },
  ];

  const filterDates = [
    { label: 'From date', value: from, onChange: handleFromChange },
    { label: 'To date', value: to, onChange: handleToChange },
  ];

  const detailModalProps = {
    open: selectedTxnId !== null,
    txn: selectedTxnQuery.data,
    isLoading: selectedTxnQuery.isLoading,
    isError: selectedTxnQuery.isError,
    errorMessage: detailErrorMessage,
    isRetrying: selectedTxnQuery.isFetching,
    canWriteAdjustments,
    lookups,
    onRetry: () => {
      void selectedTxnQuery.refetch();
    },
    onClose: () => setSelectedTxnId(null),
  };

  return {
    canReadLedger,
    canWriteAdjustments,
    pageIndex,
    pageSize,
    hasNextPage,
    hasActiveFilters,
    transactionType,
    productId,
    from,
    to,
    selectedTxnId,
    transactions,
    products,
    productOptions,
    filterSelects,
    filterDates,
    lookups,
    detailModalProps,
    transactionsQuery,
    selectedTxnQuery,
    listErrorMessage: transactionsQuery.isError
      ? formatInventoryApiError(
          transactionsQuery.error,
          'Unable to load inventory ledger history.'
        )
      : undefined,
    detailErrorMessage,
    getProductLabel,
    getLocationLabel,
    getBatchLabel,
    getEmployeeLabel,
    getUomLabel,
    handleTransactionTypeChange,
    handleProductChange,
    handleFromChange,
    handleToChange,
    clearFilters,
    handlePageChange,
    openDetailModal: (txnId: string) => setSelectedTxnId(txnId),
    closeDetailModal: () => setSelectedTxnId(null),
  };
}
