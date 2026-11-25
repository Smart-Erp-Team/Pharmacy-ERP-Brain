/**
 * Pharmacy ERP — Inventory Locations, Batches, Balances & Ledger Contract (Stage 1).
 *
 * Source of truth: /contracts/openapi.erp.yaml (components.schemas) and
 * /contracts/schemas/inventory.json.
 *
 * KEY RULES:
 *  - LocationType includes DAMAGED: SELLABLE | QUARANTINE | DAMAGED | SCRAP.
 *  - GET /api/v1/inventory/balances returns StockBalanceDtoPagedResult (with row_version).
 *  - POST /api/v1/inventory/adjustments is BranchLocal-only and accepts
 *    OPENING_BALANCE | ADJUSTMENT_IN | ADJUSTMENT_OUT | REVERSAL.
 */
import type { components } from './api-paths';

type Schemas = components['schemas'];

// Closed enum value sets (string-only)
export type LocationType = Schemas['LocationType'];
export type BatchQualityStatus = Schemas['BatchQualityStatus'];
export type InventoryTransactionType = Schemas['InventoryTransactionType'];
export type InventoryTransactionStatus = Schemas['InventoryTransactionStatus'];

/** Transaction types permissible on POST /api/v1/inventory/adjustments */
export type AdjustmentsTxnType = Extract<
  InventoryTransactionType,
  'OPENING_BALANCE' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'REVERSAL'
>;

// Locations
export type InventoryLocationDto = Schemas['InventoryLocationDto'];
export type InventoryLocationDtoPagedResult =
  Schemas['InventoryLocationDtoPagedResult'];
export type CreateInventoryLocationRequest =
  Schemas['CreateInventoryLocationRequest'];
export type UpdateInventoryLocationRequest =
  Schemas['UpdateInventoryLocationRequest'];

// Batches (org-scoped, read-only)
export type InventoryBatchDto = Schemas['InventoryBatchDto'];
export type InventoryBatchDtoPagedResult =
  Schemas['InventoryBatchDtoPagedResult'];

// Stock balances & product summary (branch-scoped)
export type StockBalanceDto = Schemas['StockBalanceDto'];
export type StockBalanceDtoPagedResult = Schemas['StockBalanceDtoPagedResult'];
export type InventorySummaryDto = Schemas['InventorySummaryDto'];

// Immutable ledger transactions & BranchLocal adjustments
export type InventoryTxnLineDto = Schemas['InventoryTxnLineDto'];
export type InventoryTxnDto = Schemas['InventoryTxnDto'];
export type InventoryTxnDtoPagedResult = Schemas['InventoryTxnDtoPagedResult'];
export type CreateInventoryAdjustmentLineRequest =
  Schemas['CreateInventoryAdjustmentLineRequest'];
export type CreateInventoryAdjustmentRequest =
  Schemas['CreateInventoryAdjustmentRequest'];
