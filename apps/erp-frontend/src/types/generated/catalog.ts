/**
 * Pharmacy ERP — Catalog & Reorder Rules Contract (Stage 1).
 *
 * Source of truth: /contracts/openapi.erp.yaml (components.schemas) and
 * /contracts/schemas/catalog.json.
 *
 * KEY RULES:
 *  - Native JSON numbers for tax_rate, conversion_to_base, sale_unit_price,
 *    reorder_point_base, reorder_quantity_base, and max_quantity_base.
 *  - UOM mutation is additive / item-level only; deactivate via PATCH is_active=false.
 *  - GET /api/v1/branches/{branchId}/products/{productId}/reorder-rule returns
 *    ReorderRuleDto directly (no wrapper object).
 */
import type { components } from './api-paths';

type Schemas = components['schemas'];

// Product categories
export type ProductCategoryDto = Schemas['ProductCategoryDto'];
export type ProductCategoryDtoPagedResult =
  Schemas['ProductCategoryDtoPagedResult'];
export type CreateProductCategoryRequest =
  Schemas['CreateProductCategoryRequest'];
export type UpdateProductCategoryRequest =
  Schemas['UpdateProductCategoryRequest'];

// Product UOMs
export type ProductUomDto = Schemas['ProductUomDto'];
export type CreateProductUomItemRequest =
  Schemas['CreateProductUomItemRequest'];
export type CreateProductUomRequest = Schemas['CreateProductUomRequest'];
export type UpdateProductUomRequest = Schemas['UpdateProductUomRequest'];

// Products
export type ProductDto = Schemas['ProductDto'];
export type ProductDtoPagedResult = Schemas['ProductDtoPagedResult'];
export type CreateProductRequest = Schemas['CreateProductRequest'];
export type UpdateProductRequest = Schemas['UpdateProductRequest'];

// Branch product reorder rules (config only)
export type ReorderRuleDto = Schemas['ReorderRuleDto'];
export type UpsertReorderRuleRequest = Schemas['UpsertReorderRuleRequest'];
