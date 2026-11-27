import { useMemo, useState, type ChangeEvent } from 'react';
import {
  useAllEmployeesQuery,
  type Employee,
} from '../../../features/employees';
import { useAllProductsQuery, type Product } from '../../../features/products';
import { useAuth } from '../../../hooks/useAuth';
import { isInventoryTransactionType } from '../../../lib/api/catalogInventoryNormalizers';
import { ApiClientError } from '../../../lib/api/client';
import { DEFAULT_PAGE_SIZE } from '../../../lib/api/pagination';
import type {
  InventoryLocation,
  InventoryTransactionStatus,
  InventoryTransactionType,
  InventoryTxn,
} from '../../../types/api';
import { formatNumericDisplay } from '../schemas/inventoryAdjustmentSchema';
import {
  useAllInventoryLocationsQuery,
  useInventoryTransactionsQuery,
} from './useInventoryQueries';

export const LEDGER_PAGE_SIZE = DEFAULT_PAGE_SIZE;

export const LEDGER_HEADERS = [
  'Transaction No',
  'Type',
  'Status',
  'Reason code',
  'Posted at',
  'Created by',
] as const;

export const NUMERIC_LINE_HEADERS = [
  'Entered qty',
  'Conversion',
  'Delta (base)',
  'Unit cost (base)',
] as const;

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

export function formatSignedDelta(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'Unavailable';
  }
  const formatted = formatNumericDisplay(value);
  if (formatted === 'Unavailable') {
    return 'Unavailable';
  }
  return value > 0 ? `+${formatted}` : formatted;
}

export function getTxnStatusBadgeVariant(
  status: InventoryTransactionStatus
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
  txnType: InventoryTransactionType
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
  getEmployeeLabel: (employeeId?: string | null) => string;
  getUomLabel: (productId: string, uomId: string) => string;
}

export function buildLedgerTxnMetaRows(
  txn: {
    reason_code?: string | null;
    posted_at?: string | null;
    created_by_employee_id?: string;
    note?: string | null;
    reverses_inventory_txn_id?: string | null;
  },
  getEmployeeLabel: (employeeId?: string | null) => string
) {
  const rows: Array<{
    label: string;
    value: string;
    wrapClass?: string;
    valueClass: string;
  }> = [
    {
      label: 'Reason code',
      value: txn.reason_code?.trim() || 'Unavailable',
      valueClass: 'text-body-sm text-text mt-1',
    },
    {
      label: 'Posted at',
      value: txn.posted_at ? formatUtcTimestamp(txn.posted_at) : 'Unavailable',
      valueClass: 'text-body-sm text-text mt-1',
    },
    {
      label: 'Created by',
      value: getEmployeeLabel(txn.created_by_employee_id),
      valueClass: 'text-body-sm text-text mt-1',
    },
    {
      label: 'Note',
      value: txn.note?.trim() || 'None',
      valueClass: 'text-body-sm text-text mt-1',
    },
  ];

  if (txn.reverses_inventory_txn_id) {
    rows.push({
      label: 'Reverses transaction',
      value: txn.reverses_inventory_txn_id,
      wrapClass: 'col-span-2',
      valueClass: 'text-body-sm text-text mt-1 font-mono',
    });
  }

  return rows;
}

export function formatLedgerTxnLines(
  txn: InventoryTxn,
  lookups: LedgerLookupFormatters
) {
  return txn.lines.map((line) => ({
    id: line.inventory_txn_line_id,
    product: lookups.getProductLabel(line.product_id),
    location: lookups.getLocationLabel(line.location_id),
    batch: line.batch_number.trim() || 'Unavailable',
    entered: `${formatNumericDisplay(line.entered_qty)} ${lookups.getUomLabel(
      line.product_id,
      line.product_uom_id
    )}`,
    conversion: formatNumericDisplay(line.conversion_snapshot),
    delta: formatSignedDelta(line.quantity_delta_base),
    cost: formatNumericDisplay(line.unit_cost_base),
  }));
}

export interface UseLedgerHistoryStateOptions {
  branchId: string;
  pageSize?: number;
  onRequestReversal?: (txn: InventoryTxn) => void;
}

export function useLedgerHistoryState({
  branchId,
  pageSize = DEFAULT_PAGE_SIZE,
  onRequestReversal,
}: UseLedgerHistoryStateOptions) {
  const { hasRole, hasAnyRole, can, runtime } = useAuth();
  const canReadLedger =
    hasAnyRole(['Admin', 'Pharmacist']) && can('inventory:read');
  const canWriteAdjustments =
    runtime === 'BranchLocal' &&
    hasAnyRole(['Admin', 'Pharmacist']) &&
    can('inventory:write');
  const isAdmin = canReadLedger && hasRole('Admin');

  const [prevBranchId, setPrevBranchId] = useState(branchId);
  const [transactionType, setTransactionType] = useState<
    InventoryTransactionType | ''
  >('');
  const [productId, setProductId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [selectedTxn, setSelectedTxn] = useState<InventoryTxn | null>(null);

  if (branchId !== prevBranchId) {
    setPrevBranchId(branchId);
    setPage(1);
    setSelectedTxn(null);
  }

  const normalizedFromDate = normalizeDateBoundary(fromDate, false);
  const normalizedToDate = normalizeDateBoundary(toDate, true);

  const transactionsQuery = useInventoryTransactionsQuery(
    {
      branch_id: branchId,
      type: transactionType || undefined,
      product_id: productId || undefined,
      from_date: normalizedFromDate,
      to_date: normalizedToDate,
      page,
      page_size: pageSize,
    },
    { enabled: canReadLedger }
  );

  const productsQuery = useAllProductsQuery(
    { include_inactive: true },
    { enabled: canReadLedger }
  );

  const locationsQuery = useAllInventoryLocationsQuery(
    { branch_id: branchId, include_inactive: true },
    { enabled: canReadLedger }
  );

  const employeesQuery = useAllEmployeesQuery(
    { include_inactive: true },
    { enabled: isAdmin }
  );

  const transactions = useMemo(
    () => transactionsQuery.data?.items ?? [],
    [transactionsQuery.data?.items]
  );

  const products = useMemo(
    () => productsQuery.data ?? [],
    [productsQuery.data]
  );

  const productsById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const item of products) {
      map.set(item.product_id, item);
    }
    return map;
  }, [products]);

  const locationsById = useMemo(() => {
    const map = new Map<string, InventoryLocation>();
    for (const loc of locationsQuery.data ?? []) {
      map.set(loc.location_id, loc);
    }
    return map;
  }, [locationsQuery.data]);

  const employeesById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const emp of employeesQuery.data ?? []) {
      map.set(emp.employee_id, emp);
    }
    return map;
  }, [employeesQuery.data]);

  const getProductLabel = (id: string): string => {
    const product = productsById.get(id);
    return product ? `${product.name} (${product.sku})` : 'Unavailable';
  };

  const getLocationLabel = (id: string): string => {
    const loc = locationsById.get(id);
    return loc ? `${loc.name} (${loc.location_code})` : 'Unavailable';
  };

  const getEmployeeLabel = (id: string | null | undefined): string => {
    const trimmed = id?.trim() ?? '';
    if (!trimmed) {
      return 'Unavailable';
    }
    if (isAdmin) {
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

  const handleTransactionTypeChange = (nextValue: string) => {
    setTransactionType(isInventoryTransactionType(nextValue) ? nextValue : '');
    setPage(1);
  };

  const handleProductChange = (nextProductId: string) => {
    setProductId(nextProductId);
    setPage(1);
  };

  const handleFromDateChange = (nextFrom: string) => {
    setFromDate(nextFrom);
    setPage(1);
  };

  const handleToDateChange = (nextTo: string) => {
    setToDate(nextTo);
    setPage(1);
  };

  const clearFilters = () => {
    setTransactionType('');
    setProductId('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const totalCount = transactionsQuery.data?.total_count ?? null;
  const hasNextPage = (transactionsQuery.data?.next_cursor ?? null) !== null;

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1) {
      return;
    }
    if (nextPage > page && !hasNextPage) {
      return;
    }
    setPage(nextPage);
  };

  const hasActiveFilters = Boolean(
    transactionType || productId || fromDate || toDate
  );

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
    getEmployeeLabel,
    getUomLabel,
  };

  const filterSelects = [
    {
      label: 'Transaction type',
      options: LEDGER_TXN_TYPE_OPTIONS,
      value: transactionType,
      onChange: (e: ChangeEvent<HTMLSelectElement>) =>
        handleTransactionTypeChange(e.target.value),
    },
    {
      label: 'Product',
      options: productOptions,
      value: productId,
      onChange: (e: ChangeEvent<HTMLSelectElement>) =>
        handleProductChange(e.target.value),
    },
  ];

  const filterDates = [
    {
      label: 'From date',
      value: fromDate,
      onChange: (e: ChangeEvent<HTMLInputElement>) =>
        handleFromDateChange(e.target.value),
    },
    {
      label: 'To date',
      value: toDate,
      onChange: (e: ChangeEvent<HTMLInputElement>) =>
        handleToDateChange(e.target.value),
    },
  ];

  const detailModalProps = {
    open: selectedTxn !== null,
    txn: selectedTxn,
    canWriteAdjustments,
    lookups,
    onClose: () => setSelectedTxn(null),
    onReverseTransaction: (txn: InventoryTxn) => {
      setSelectedTxn(null);
      onRequestReversal?.(txn);
    },
  };

  const paginationProps = {
    page,
    pageSize,
    itemCount: totalCount,
    hasNextPage,
    onPageChange: handlePageChange,
  };

  const tableRows = transactions.map((txn) => ({
    txn,
    createdByLabel: getEmployeeLabel(txn.created_by_employee_id),
  }));

  return {
    canReadLedger,
    canWriteAdjustments,
    page,
    pageSize,
    totalCount,
    hasNextPage,
    hasActiveFilters,
    transactionType,
    productId,
    fromDate,
    toDate,
    selectedTxn,
    transactions,
    tableRows,
    products,
    productOptions,
    filterSelects,
    filterDates,
    lookups,
    detailModalProps,
    paginationProps,
    transactionsQuery,
    retryList: () => void transactionsQuery.refetch(),
    listErrorMessage: transactionsQuery.isError
      ? formatInventoryApiError(
          transactionsQuery.error,
          'Unable to load inventory ledger history.'
        )
      : undefined,
    emptyTitle: hasActiveFilters
      ? 'No matching ledger transactions'
      : 'No ledger transactions',
    emptyDescription: hasActiveFilters
      ? 'Adjust or clear the ledger filters to see transactions.'
      : 'No inventory ledger transactions have been recorded for this branch yet.',
    getProductLabel,
    getLocationLabel,
    getEmployeeLabel,
    getUomLabel,
    handleTransactionTypeChange,
    handleProductChange,
    handleFromDateChange,
    handleToDateChange,
    clearFilters,
    handlePageChange,
    openDetailModal: (txn: InventoryTxn) => setSelectedTxn(txn),
    closeDetailModal: () => setSelectedTxn(null),
  };
}
