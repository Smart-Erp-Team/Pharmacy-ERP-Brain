/**
 * Pharmacy ERP — Canonical Integration Contract (Stage 1).
 *
 * Source of truth: /contracts/openapi.erp.yaml (components.schemas) and
 * /contracts/schemas/canonical.json.
 *
 * Covers capabilities discovery, product/inventory read feeds, and idempotent
 * catalog/reorder-rule configuration writes for external / Brain integrations.
 */
import type { components } from './api-paths';

type Schemas = components['schemas'];

export type CatalogConfigurationAction = Schemas['CatalogConfigurationAction'];
export type CanonicalCapabilitiesDto = Schemas['CanonicalCapabilitiesDto'];
export type CanonicalUomConversionDto = Schemas['CanonicalUomConversionDto'];
export type CanonicalProductDto = Schemas['CanonicalProductDto'];
export type CanonicalProductFeedPageDto =
  Schemas['CanonicalProductFeedPageDto'];
export type CanonicalUomItemDto = Schemas['CanonicalUomItemDto'];
export type CanonicalProductConfigurationRequest =
  Schemas['CanonicalProductConfigurationRequest'];
export type CanonicalReorderRuleConfigurationRequest =
  Schemas['CanonicalReorderRuleConfigurationRequest'];
export type CanonicalWriteResultDto = Schemas['CanonicalWriteResultDto'];
export type CanonicalInventoryLotDto = Schemas['CanonicalInventoryLotDto'];
export type CanonicalInventoryItemDto = Schemas['CanonicalInventoryItemDto'];
export type CanonicalInventoryItemDtoPagedResult =
  Schemas['CanonicalInventoryItemDtoPagedResult'];
