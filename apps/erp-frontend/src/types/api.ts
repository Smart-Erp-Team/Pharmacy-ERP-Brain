/**
 * Pharmacy ERP — Authoritative Stage 1 API Type Aliases & Re-exports
 *
 * Strict architectural rules:
 *  - All domain types derive exclusively from `src/types/generated/`.
 *  - `types` imports NOTHING outside `src/types/` (STRUCTURE.md §5).
 *  - NO handwritten API shapes, NO duplicates, NO `any`.
 */

// 1. Full re-export of all generated Stage 1 domain contracts
export * from './generated';

import type {
  // Common & Auth
  AddressDto,
  ApiErrorBodyDto,
  ApiErrorDetailDto,
  ApiErrorEnvelopeDto,
  CurrentUserDto,
  ErpRuntimeMode,
  ErrorCode,
  LoginRequest,
  LoginResponse,
  PermissionScope,
  UserRole,
  // Identity
  OrganizationDto,
  BranchDto,
  EmployeeDto,
  UserDto,
  // Catalog & Inventory
  ProductDto,
  ProductUomDto,
  ProductCategoryDto,
  ReorderRuleDto,
  InventoryLocationDto,
  InventoryBatchDto,
  StockBalanceDto,
  InventorySummaryDto,
  InventoryTxnDto,
  InventoryTxnLineDto,
  // OpenAPI Endpoint & Operation Types
  paths,
  operations,
  components,
} from './generated';

// 2. OpenAPI Contract Top-Level Type Aliases
export type ApiPaths = paths;
export type ApiOperations = operations;
export type ApiComponents = components;

// 3. Normalized strict DTO types derived directly from OpenAPI generated types
//    (used by src/lib/api/normalizers.ts to enforce required runtime fields
//    for OpenAPI schemas that omit `required`).
export type NormalizedApiErrorDetail = Required<ApiErrorDetailDto>;

export type NormalizedApiErrorBody = Required<
  Omit<ApiErrorBodyDto, 'code' | 'details'>
> & {
  code: ErrorCode;
  details: NormalizedApiErrorDetail[];
};

export type NormalizedApiErrorEnvelope = Required<
  Omit<ApiErrorEnvelopeDto, 'error'>
> & {
  error: NormalizedApiErrorBody;
};

export type NormalizedCurrentUser = Required<Omit<CurrentUserDto, 'scopes'>> & {
  scopes: PermissionScope[];
};

export type NormalizedLoginResponse = Required<Omit<LoginResponse, 'user'>> & {
  user: NormalizedCurrentUser;
};

export type NormalizedAddress = AddressDto;

// 4. Clean Stage 1 ergonomic aliases for UI, stores, and feature modules
export type Role = UserRole;
export type RuntimeMode = ErpRuntimeMode;
export type UserPermission = PermissionScope;
export type CurrentUser = NormalizedCurrentUser;
export type TokenPair = NormalizedLoginResponse;
export type AuthCredentials = LoginRequest;
export type ApiError = NormalizedApiErrorEnvelope;

export type Organization = OrganizationDto;
export type Branch = BranchDto;
export type Employee = EmployeeDto;
export type User = UserDto;

export type Product = ProductDto;
export type ProductUom = ProductUomDto;
export type ProductCategory = ProductCategoryDto;
export type ReorderRule = ReorderRuleDto;

export type InventoryLocation = InventoryLocationDto;
export type InventoryBatch = InventoryBatchDto;
export type StockBalance = StockBalanceDto;
export type InventorySummary = InventorySummaryDto;
export type InventoryTxn = InventoryTxnDto;
export type InventoryTxnLine = InventoryTxnLineDto;
