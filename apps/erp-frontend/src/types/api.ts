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
  EnrollmentTokenResponse,
  RedeemBranchEnrollmentResponse,
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

export type NormalizedOrganization = Required<OrganizationDto>;

export type NormalizedBranch = Required<Omit<BranchDto, 'address'>> & {
  address: NormalizedAddress;
};

export type NormalizedEnrollmentToken = Required<EnrollmentTokenResponse>;

export type NormalizedRedeemEnrollment =
  Required<RedeemBranchEnrollmentResponse>;

export type NormalizedEmployee = Required<Omit<EmployeeDto, 'address'>> & {
  address: NormalizedAddress;
};

export type NormalizedUser = Required<UserDto>;

export type NormalizedProductCategory = Required<ProductCategoryDto>;

export type NormalizedProductUom = Required<ProductUomDto>;

export type NormalizedProduct = Required<Omit<ProductDto, 'uoms'>> & {
  uoms: NormalizedProductUom[];
};

export type NormalizedReorderRule = Required<ReorderRuleDto>;

export type NormalizedInventoryLocation = Required<InventoryLocationDto>;

export type NormalizedInventoryBatch = Required<InventoryBatchDto>;

export type NormalizedStockBalance = Required<StockBalanceDto>;

export type NormalizedInventorySummary = Required<
  Omit<InventorySummaryDto, 'locations_and_lots'>
> & {
  locations_and_lots: NormalizedStockBalance[];
};

export type NormalizedInventoryTxnLine = Required<InventoryTxnLineDto>;

export type NormalizedInventoryTxn = Required<
  Omit<InventoryTxnDto, 'lines'>
> & {
  lines: NormalizedInventoryTxnLine[];
};

// 4. Clean Stage 1 ergonomic aliases for UI, stores, and feature modules
export type Role = UserRole;
export type RuntimeMode = ErpRuntimeMode;
export type UserPermission = PermissionScope;
export type CurrentUser = NormalizedCurrentUser;
export type TokenPair = NormalizedLoginResponse;
export type AuthCredentials = LoginRequest;
export type ApiError = NormalizedApiErrorEnvelope;

export type Organization = NormalizedOrganization;
export type Branch = NormalizedBranch;
export type EnrollmentToken = NormalizedEnrollmentToken;
export type RedeemEnrollment = NormalizedRedeemEnrollment;
export type Employee = NormalizedEmployee;
export type User = NormalizedUser;

export type ProductCategory = NormalizedProductCategory;
export type ProductUom = NormalizedProductUom;
export type Product = NormalizedProduct;
export type ReorderRule = NormalizedReorderRule;

export type InventoryLocation = NormalizedInventoryLocation;
export type InventoryBatch = NormalizedInventoryBatch;
export type StockBalance = NormalizedStockBalance;
export type InventorySummary = NormalizedInventorySummary;
export type InventoryTxnLine = NormalizedInventoryTxnLine;
export type InventoryTxn = NormalizedInventoryTxn;
