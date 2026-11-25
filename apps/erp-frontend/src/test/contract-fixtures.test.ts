// Owner: erp-frontend
import { describe, it, expect } from 'vitest';

import type {
  AddressDto,
  BatchQualityStatus,
  BranchDto,
  LocationType,
  NormalizedCurrentUser,
  NormalizedLoginResponse,
  OrganizationDto,
  ProductDto,
  StockBalanceDto,
} from '../types/api';
import {
  normalizeAddress,
  normalizeCurrentUser,
  normalizeLoginResponse,
} from '../lib/api/normalizers';

import branchFixture from '@contracts/fixtures/branch.json';
import organizationFixture from '@contracts/fixtures/organization.json';
import productFixture from '@contracts/fixtures/product.json';
import inventoryBalanceFixture from '@contracts/fixtures/inventory-balance.json';
import authTokenPairFixture from '@contracts/fixtures/auth-token-pair.json';
import currentUserContextFixture from '@contracts/fixtures/current-user-context.json';

const LOCATION_TYPES: readonly LocationType[] = [
  'SELLABLE',
  'QUARANTINE',
  'DAMAGED',
  'SCRAP',
];

const QUALITY_STATUSES: readonly BatchQualityStatus[] = [
  'AVAILABLE',
  'QUARANTINED',
  'EXPIRED',
  'RECALLED',
];

function isLocationType(value: string): value is LocationType {
  return LOCATION_TYPES.some((item) => item === value);
}

function isBatchQualityStatus(value: string): value is BatchQualityStatus {
  return QUALITY_STATUSES.some((item) => item === value);
}

describe('Stage 1 Contract Fixtures Type & Runtime Conformance', () => {
  it('branch.json conforms to BranchDto and normalizes AddressDto', () => {
    const branch: BranchDto = branchFixture;
    const address: AddressDto = normalizeAddress(branch.address, 'branch.json');

    expect(branch.branch_id).toBeDefined();
    expect(branch.branch_code).toBe('MED-DT');
    expect(branch.is_active).toBe(true);
    expect(address.city).toBe('Cairo');
    expect(address.country_code).toBe('EG');
  });

  it('organization.json conforms to OrganizationDto', () => {
    const org: OrganizationDto = organizationFixture;

    expect(org.organization_id).toBeDefined();
    expect(org.organization_code).toBe('MEDCARE');
    expect(org.base_currency).toBe('EGP');
    expect(org.time_zone_id).toBe('Africa/Cairo');
    expect(org.enrollment_setup_state).toBe('PENDING');
  });

  it('product.json conforms to ProductDto with native numeric decimals', () => {
    const product: ProductDto = productFixture;
    const uoms = product.uoms ?? [];

    expect(product.product_id).toBeDefined();
    expect(product.sku).toBe('MED-AUG-1000');
    expect(uoms.length).toBeGreaterThan(0);

    const baseUom = uoms.find((u) => u.is_base);
    expect(baseUom).toBeDefined();
    expect(baseUom?.conversion_to_base).toBe(1);
    expect(baseUom?.sale_unit_price).toBe(10.5);
  });

  it('inventory-balance.json conforms to StockBalanceDto', () => {
    const { location_type, quality_status, ...rest } = inventoryBalanceFixture;
    if (!isLocationType(location_type)) {
      throw new Error(`Invalid location_type in fixture: ${location_type}`);
    }
    if (!isBatchQualityStatus(quality_status)) {
      throw new Error(`Invalid quality_status in fixture: ${quality_status}`);
    }

    const balance: StockBalanceDto = {
      ...rest,
      location_type,
      quality_status,
    };

    expect(balance.product_id).toBeDefined();
    expect(balance.on_hand_qty_base).toBe(280);
    expect(balance.available_qty_base).toBe(280);
    expect(balance.average_unit_cost).toBe(7.2);
    expect(balance.row_version).toBe(3);
  });

  it('auth-token-pair.json validates via normalizeLoginResponse', () => {
    const tokenPair: NormalizedLoginResponse = normalizeLoginResponse(
      authTokenPairFixture,
      'auth-token-pair.json'
    );

    expect(tokenPair.token_type).toBe('Bearer');
    expect(tokenPair.user.username).toBe('sarah.pharm@medcare.test');
    expect(tokenPair.user.role).toBe('Pharmacist');
    expect(tokenPair.user.runtime_mode).toBe('Cloud');
    expect(tokenPair.key_id).toBe('7f3b9a12c4e84d5fa6b1c2d3e4f50617');
  });

  it('current-user-context.json validates via normalizeCurrentUser', () => {
    const ctx: NormalizedCurrentUser = normalizeCurrentUser(
      currentUserContextFixture,
      'current-user-context.json'
    );

    expect(ctx.username).toBe('admin@medcare.test');
    expect(ctx.role).toBe('Admin');
    expect(ctx.branch_scope).toBe('ALL');
    expect(ctx.runtime_mode).toBe('Cloud');
    expect(ctx.scopes).toContain('user:admin');
  });
});
