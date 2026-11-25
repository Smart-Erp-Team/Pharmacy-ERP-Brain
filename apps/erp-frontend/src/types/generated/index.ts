/**
 * Pharmacy ERP — Stage 1 API Contract TypeScript entry point.
 *
 * One re-export per active Stage 1 domain. The OpenAPI master lives at
 * /contracts/openapi.erp.yaml; JSON Schemas at /contracts/schemas/*.json.
 */
export * from './common';
export * from './auth';
export * from './identity';
export * from './catalog';
export * from './inventory';
export * from './canonical';
export * from './api-paths';
