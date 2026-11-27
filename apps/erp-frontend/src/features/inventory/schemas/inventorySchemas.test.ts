/** @vitest-environment jsdom */
import { zodResolver } from '@hookform/resolvers/zod';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useForm, type UseFormSetError } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../../../lib/api/client';
import type { InventoryLocation } from '../../../types/api';
import {
  ADJUSTMENT_TXN_TYPES,
  ADJUSTMENTS_TXN_TYPES,
  createEmptyAdjustmentLine,
  DEFAULT_ADJUSTMENT_FORM_VALUES,
  DEFAULT_ADJUSTMENT_LINE,
  formatNumericDisplay,
  inventoryAdjustmentFormSchema,
  isValidIsoDate,
  parseFiniteNumber,
  toCreateInventoryAdjustmentPayload,
  type InventoryAdjustmentFormValues,
} from './inventoryAdjustmentSchema';
import {
  applyAdjustmentFormApiError,
  applyCreateLocationFormApiError,
  applyEditLocationFormApiError,
  applyLocationFormApiError,
} from './inventoryErrorMapper';
import {
  createEditLocationFormSchema,
  createLocationFormSchema,
  DEFAULT_LOCATION_FORM_VALUES,
  editLocationFormSchema,
  isSellableAllowedForLocationType,
  LOCATION_TYPES,
  locationDtoToFormValues,
  toCreateLocationPayload,
  toLocationPatchPayload,
  type CreateLocationFormValues,
  type EditLocationFormValues,
} from './inventoryLocationSchema';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('inventoryLocationSchema', () => {
  it('supports all 4 Stage 1 LocationType values and builds CreateInventoryLocationRequest without is_active', () => {
    expect(LOCATION_TYPES).toEqual([
      'SELLABLE',
      'QUARANTINE',
      'DAMAGED',
      'SCRAP',
    ]);
    expect(isSellableAllowedForLocationType('SELLABLE')).toBe(true);
    expect(isSellableAllowedForLocationType('QUARANTINE')).toBe(false);
    expect(isSellableAllowedForLocationType('DAMAGED')).toBe(false);
    expect(isSellableAllowedForLocationType('SCRAP')).toBe(false);

    const parsedSellable = createLocationFormSchema.parse({
      location_code: '  CAI-FRIDGE-1  ',
      name: '  Cold Chain Fridge  ',
      location_type: 'SELLABLE',
      is_sellable: true,
    });

    const createPayload = toCreateLocationPayload(
      parsedSellable,
      ' 11111111-2222-4111-8111-000000000001 '
    );
    expect(createPayload).toEqual({
      branch_id: '11111111-2222-4111-8111-000000000001',
      location_code: 'CAI-FRIDGE-1',
      name: 'Cold Chain Fridge',
      location_type: 'SELLABLE',
      is_sellable: true,
    });
    expect('is_active' in createPayload).toBe(false);

    const parsedDamaged = createLocationFormSchema.parse({
      location_code: 'DMG-BIN-1',
      name: 'Damaged Goods Bin',
      location_type: 'DAMAGED',
      is_sellable: false,
    });
    expect(
      toCreateLocationPayload(
        parsedDamaged,
        '11111111-2222-4111-8111-000000000001'
      )
    ).toEqual({
      branch_id: '11111111-2222-4111-8111-000000000001',
      location_code: 'DMG-BIN-1',
      name: 'Damaged Goods Bin',
      location_type: 'DAMAGED',
      is_sellable: false,
    });
  });

  it('enforces is_sellable === false when location_type !== SELLABLE and rejects invalid bounds', () => {
    for (const nonSellableType of ['QUARANTINE', 'DAMAGED', 'SCRAP'] as const) {
      const invalidSellable = createLocationFormSchema.safeParse({
        location_code: 'LOC-01',
        name: 'Hold Bay',
        location_type: nonSellableType,
        is_sellable: true,
      });
      expect(invalidSellable.success).toBe(false);
      if (!invalidSellable.success) {
        expect(
          invalidSellable.error.issues.map((issue) => issue.path.join('.'))
        ).toContain('is_sellable');
      }
    }

    const invalidBounds = createLocationFormSchema.safeParse({
      ...DEFAULT_LOCATION_FORM_VALUES,
      location_code: 'C'.repeat(31),
      name: 'N'.repeat(101),
      location_type: 'UNKNOWN_TYPE',
    });
    expect(invalidBounds.success).toBe(false);
    if (!invalidBounds.success) {
      const paths = invalidBounds.error.issues.map((issue) =>
        issue.path.join('.')
      );
      expect(paths).toContain('location_code');
      expect(paths).toContain('name');
      expect(paths).toContain('location_type');
    }

    const blankRequired = createLocationFormSchema.safeParse({
      location_code: '   ',
      name: '   ',
      location_type: 'QUARANTINE',
      is_sellable: false,
    });
    expect(blankRequired.success).toBe(false);
  });

  it('converts InventoryLocation to EditLocationFormValues and omits immutable location_code and location_type on patch', () => {
    const location: InventoryLocation = {
      location_id: '694cb9a9-c19d-3c46-be41-a7fc76fcdc9f',
      organization_id: '11111111-1111-4111-8111-111111111101',
      branch_id: '11111111-2222-4111-8111-000000000001',
      location_code: 'MAIN-SELLABLE',
      name: 'Main Pharmacy Shelf',
      location_type: 'SELLABLE',
      is_sellable: true,
      is_active: true,
      updated_at: '2026-11-25T10:15:00+00:00',
    };

    const formValues = locationDtoToFormValues(location);
    expect(formValues).toEqual({
      name: 'Main Pharmacy Shelf',
      is_sellable: true,
      is_active: true,
    });
    expect('location_code' in formValues).toBe(false);
    expect('location_type' in formValues).toBe(false);

    const parsedEdit = editLocationFormSchema.parse({
      ...formValues,
      name: '  Updated Shelf  ',
      is_sellable: false,
      is_active: false,
    });
    const patchPayload = toLocationPatchPayload(parsedEdit);
    expect(patchPayload).toEqual({
      name: 'Updated Shelf',
      is_sellable: false,
      is_active: false,
    });
    expect('location_code' in patchPayload).toBe(false);
    expect('location_type' in patchPayload).toBe(false);

    const damagedEditSchema = createEditLocationFormSchema('DAMAGED');
    const badDamagedEdit = damagedEditSchema.safeParse({
      name: 'Damaged Shelf',
      is_sellable: true,
      is_active: true,
    });
    expect(badDamagedEdit.success).toBe(false);
    if (!badDamagedEdit.success) {
      expect(badDamagedEdit.error.issues[0]?.path).toEqual(['is_sellable']);
    }
  });

  it('integrates createLocationFormSchema and editLocationFormSchema with React Hook Form zodResolver', async () => {
    const { result } = renderHook(() => {
      const createForm = useForm<CreateLocationFormValues>({
        resolver: zodResolver(createLocationFormSchema),
        defaultValues: DEFAULT_LOCATION_FORM_VALUES,
      });
      const editForm = useForm<EditLocationFormValues>({
        resolver: zodResolver(editLocationFormSchema),
        defaultValues: { name: '', is_sellable: true, is_active: true },
      });
      return {
        triggerCreate: createForm.trigger,
        triggerEdit: editForm.trigger,
        codeError: createForm.formState.errors.location_code?.message,
        createNameError: createForm.formState.errors.name?.message,
        editNameError: editForm.formState.errors.name?.message,
      };
    });

    let createValid = true;
    let editValid = true;
    await act(async () => {
      createValid = await result.current.triggerCreate();
      editValid = await result.current.triggerEdit();
    });
    expect(createValid).toBe(false);
    expect(editValid).toBe(false);
    await waitFor(() => {
      expect(result.current.codeError).toBe('Location code is required');
      expect(result.current.createNameError).toBe('Location name is required');
      expect(result.current.editNameError).toBe('Location name is required');
    });
  });
});

describe('native finite number & ISO date helpers in inventoryAdjustmentSchema', () => {
  it('parses finite numbers cleanly and rejects -0, NaN, Infinity, and non-decimal input', () => {
    expect(parseFiniteNumber('5000')).toBe(5000);
    expect(parseFiniteNumber('  2.5  ')).toBe(2.5);
    expect(parseFiniteNumber('.25')).toBe(0.25);
    expect(parseFiniteNumber('0')).toBe(0);
    expect(parseFiniteNumber('0.0000')).toBe(0);
    expect(parseFiniteNumber('-10.5')).toBe(-10.5);
    expect(parseFiniteNumber('-0')).toBeNull();
    expect(parseFiniteNumber('-0.0')).toBeNull();
    expect(parseFiniteNumber('')).toBeNull();
    expect(parseFiniteNumber('   ')).toBeNull();
    expect(parseFiniteNumber('NaN')).toBeNull();
    expect(parseFiniteNumber('Infinity')).toBeNull();
    expect(parseFiniteNumber('1e5')).toBeNull();
    expect(parseFiniteNumber('abc')).toBeNull();
  });

  it('validates real YYYY-MM-DD calendar dates', () => {
    expect(isValidIsoDate('2027-01-28')).toBe(true);
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2025-02-29')).toBe(false);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('01-01-2026')).toBe(false);
    expect(isValidIsoDate('not-a-date')).toBe(false);
  });

  it('formats native finite numbers for display and handles null/undefined/non-finite safely', () => {
    expect(formatNumericDisplay(null)).toBe('Unavailable');
    expect(formatNumericDisplay(undefined)).toBe('Unavailable');
    expect(formatNumericDisplay(Number.NaN, { fallback: '—' })).toBe('—');
    expect(formatNumericDisplay(Number.POSITIVE_INFINITY)).toBe('Unavailable');
    expect(formatNumericDisplay(-0)).toBe('0');
    expect(formatNumericDisplay(5000)).toBe('5,000');
    expect(formatNumericDisplay(1.2052)).toBe('1.2052');
    expect(
      formatNumericDisplay(1.2052, { minDecimals: 2, maxDecimals: 2 })
    ).toBe('1.21');
    expect(formatNumericDisplay(12, { minDecimals: 2, maxDecimals: 4 })).toBe(
      '12.00'
    );
  });
});

describe('inventoryAdjustmentFormSchema and toCreateInventoryAdjustmentPayload', () => {
  const branchId = '11111111-2222-4111-8111-000000000001';
  const sampleLine = {
    product_id: '6dbdb1a7-c723-da4c-8e0e-b067c18bc710',
    product_uom_id: 'db06a376-50a7-224c-b9c5-4f342c45debb',
    location_id: '694cb9a9-c19d-3c46-be41-a7fc76fcdc9f',
    batch_number: ' MEDCARE-LOT-2601 ',
    manufactured_on: ' 2026-01-10 ',
    expires_on: ' 2027-07-31 ',
    entered_qty: ' 2.5 ',
    unit_cost_entered: ' 100.80 ',
  };

  it('exposes the exact 4 Stage 1 adjustment transaction types', () => {
    expect(ADJUSTMENTS_TXN_TYPES).toEqual([
      'OPENING_BALANCE',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'REVERSAL',
    ]);
    expect(ADJUSTMENT_TXN_TYPES).toBe(ADJUSTMENTS_TXN_TYPES);
  });

  it('validates OPENING_BALANCE and ADJUSTMENT_IN and emits native numbers in CreateInventoryAdjustmentRequest', () => {
    const missingCost = inventoryAdjustmentFormSchema.safeParse({
      ...DEFAULT_ADJUSTMENT_FORM_VALUES,
      transaction_type: 'OPENING_BALANCE',
      reason_code: 'INITIAL_COUNT',
      lines: [{ ...sampleLine, unit_cost_entered: '   ' }],
    });
    expect(missingCost.success).toBe(false);
    if (!missingCost.success) {
      expect(missingCost.error.issues[0]?.path).toEqual([
        'lines',
        0,
        'unit_cost_entered',
      ]);
    }

    const parsedIn = inventoryAdjustmentFormSchema.parse({
      transaction_type: 'ADJUSTMENT_IN',
      reason_code: ' MANUAL_RESTOCK_TEST ',
      note: '   ',
      reverses_inventory_txn_id: '',
      lines: [sampleLine],
    });

    expect(
      toCreateInventoryAdjustmentPayload(parsedIn, ` ${branchId} `)
    ).toEqual({
      branch_id: branchId,
      transaction_type: 'ADJUSTMENT_IN',
      reason_code: 'MANUAL_RESTOCK_TEST',
      note: null,
      reverses_inventory_txn_id: null,
      lines: [
        {
          product_id: '6dbdb1a7-c723-da4c-8e0e-b067c18bc710',
          product_uom_id: 'db06a376-50a7-224c-b9c5-4f342c45debb',
          location_id: '694cb9a9-c19d-3c46-be41-a7fc76fcdc9f',
          batch_number: 'MEDCARE-LOT-2601',
          manufactured_on: '2026-01-10',
          expires_on: '2027-07-31',
          entered_qty: 2.5,
          unit_cost_entered: 100.8,
        },
      ],
    });

    // Zero cost is allowed (>= 0) and blank optional batch/date fields map to null
    const parsedZeroCost = inventoryAdjustmentFormSchema.parse({
      transaction_type: 'OPENING_BALANCE',
      reason_code: 'INITIAL_COUNT',
      note: 'Opening stock',
      reverses_inventory_txn_id: '',
      lines: [
        {
          ...sampleLine,
          batch_number: '  ',
          manufactured_on: '',
          expires_on: '',
          entered_qty: '10',
          unit_cost_entered: '0',
        },
      ],
    });

    expect(
      toCreateInventoryAdjustmentPayload(parsedZeroCost, branchId)
    ).toEqual({
      branch_id: branchId,
      transaction_type: 'OPENING_BALANCE',
      reason_code: 'INITIAL_COUNT',
      note: 'Opening stock',
      reverses_inventory_txn_id: null,
      lines: [
        {
          product_id: '6dbdb1a7-c723-da4c-8e0e-b067c18bc710',
          product_uom_id: 'db06a376-50a7-224c-b9c5-4f342c45debb',
          location_id: '694cb9a9-c19d-3c46-be41-a7fc76fcdc9f',
          batch_number: null,
          manufactured_on: null,
          expires_on: null,
          entered_qty: 10,
          unit_cost_entered: 0,
        },
      ],
    });
  });

  it('nulls unit_cost_entered on ADJUSTMENT_OUT and emits lines: null with optional reason_code on REVERSAL', () => {
    const parsedOut = inventoryAdjustmentFormSchema.parse({
      transaction_type: 'ADJUSTMENT_OUT',
      reason_code: 'DAMAGED_REMOVAL',
      note: 'Broken blister pack',
      reverses_inventory_txn_id: '',
      lines: [{ ...sampleLine, unit_cost_entered: '' }],
    });

    const outPayload = toCreateInventoryAdjustmentPayload(parsedOut, branchId);
    expect(outPayload.lines?.[0]?.unit_cost_entered).toBeNull();
    expect(outPayload.lines?.[0]?.entered_qty).toBe(2.5);

    const invalidReversal = inventoryAdjustmentFormSchema.safeParse({
      transaction_type: 'REVERSAL',
      reason_code: '',
      note: '',
      reverses_inventory_txn_id: 'not-a-uuid',
      lines: [],
    });
    expect(invalidReversal.success).toBe(false);
    if (!invalidReversal.success) {
      expect(invalidReversal.error.issues[0]?.path).toEqual([
        'reverses_inventory_txn_id',
      ]);
    }

    // Reversal succeeds with blank reason_code, blank note, and empty or default blank lines
    const validReversal = inventoryAdjustmentFormSchema.parse({
      transaction_type: 'REVERSAL',
      reason_code: '',
      note: '',
      reverses_inventory_txn_id: '7d9503b8-1001-4ca5-8a0b-cd4040620002',
      lines: [createEmptyAdjustmentLine()],
    });

    expect(toCreateInventoryAdjustmentPayload(validReversal, branchId)).toEqual(
      {
        branch_id: branchId,
        transaction_type: 'REVERSAL',
        reason_code: null,
        note: null,
        reverses_inventory_txn_id: '7d9503b8-1001-4ca5-8a0b-cd4040620002',
        lines: null,
      }
    );
  });

  it('rejects invalid dates, expires_on < manufactured_on, -0, <=0 qty, negative cost, and empty lines on non-REVERSAL', () => {
    const badInputs = inventoryAdjustmentFormSchema.safeParse({
      transaction_type: 'ADJUSTMENT_IN',
      reason_code: 'R'.repeat(41),
      note: 'N'.repeat(501),
      reverses_inventory_txn_id: '',
      lines: [
        {
          ...sampleLine,
          manufactured_on: '2026-02-30',
          expires_on: 'invalid-date',
          entered_qty: '-0',
          unit_cost_entered: '-0',
        },
        {
          ...sampleLine,
          manufactured_on: '2027-06-01',
          expires_on: '2026-01-01',
          entered_qty: '0',
          unit_cost_entered: '-1',
        },
      ],
    });
    expect(badInputs.success).toBe(false);
    if (!badInputs.success) {
      const paths = badInputs.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('reason_code');
      expect(paths).toContain('note');
      expect(paths).toContain('lines.0.manufactured_on');
      expect(paths).toContain('lines.0.expires_on');
      expect(paths).toContain('lines.0.entered_qty');
      expect(paths).toContain('lines.0.unit_cost_entered');
      expect(paths).toContain('lines.1.expires_on');
      expect(paths).toContain('lines.1.entered_qty');
      expect(paths).toContain('lines.1.unit_cost_entered');
    }

    const emptyLines = inventoryAdjustmentFormSchema.safeParse({
      ...DEFAULT_ADJUSTMENT_FORM_VALUES,
      reason_code: 'TEST',
      lines: [],
    });
    expect(emptyLines.success).toBe(false);
    if (!emptyLines.success) {
      expect(emptyLines.error.issues[0]?.path).toEqual(['lines']);
    }

    expect(createEmptyAdjustmentLine()).toEqual(DEFAULT_ADJUSTMENT_LINE);
    expect(createEmptyAdjustmentLine()).not.toBe(DEFAULT_ADJUSTMENT_LINE);
  });

  it('integrates inventoryAdjustmentFormSchema with React Hook Form zodResolver', async () => {
    const { result } = renderHook(() => {
      const form = useForm<InventoryAdjustmentFormValues>({
        resolver: zodResolver(inventoryAdjustmentFormSchema),
        defaultValues: DEFAULT_ADJUSTMENT_FORM_VALUES,
      });
      return {
        trigger: form.trigger,
        reasonError: form.formState.errors.reason_code?.message,
        qtyError: form.formState.errors.lines?.[0]?.entered_qty?.message,
        costError: form.formState.errors.lines?.[0]?.unit_cost_entered?.message,
      };
    });

    let valid = true;
    await act(async () => {
      valid = await result.current.trigger();
    });
    expect(valid).toBe(false);
    await waitFor(() => {
      expect(result.current.reasonError).toBe('Reason code is required');
      expect(result.current.qtyError).toBe('Quantity is required');
      expect(result.current.costError).toBe(
        'Unit cost is required for stock-in adjustments'
      );
    });
  });
});

describe('inventoryErrorMapper', () => {
  it('maps location 422, 409 CONFLICT, 403 FORBIDDEN/FORBIDDEN_BRANCH, 400 MALFORMED_REQUEST, and non-API errors', () => {
    const createSetError = vi.fn<UseFormSetError<CreateLocationFormValues>>();
    const err422 = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Invalid location',
        details: [
          { field: 'location_code', issue: 'Too long' },
          { field: 'location_type', issue: 'Invalid type' },
          { field: 'is_sellable', issue: 'Only SELLABLE may be sellable' },
        ],
      },
      422
    );
    expect(applyLocationFormApiError(err422, createSetError)).toBeNull();
    expect(createSetError).toHaveBeenCalledWith('location_code', {
      type: 'server',
      message: 'Too long',
    });
    expect(createSetError).toHaveBeenCalledWith('location_type', {
      type: 'server',
      message: 'Invalid type',
    });
    expect(createSetError).toHaveBeenCalledWith('is_sellable', {
      type: 'server',
      message: 'Only SELLABLE may be sellable',
    });

    const err409 = new ApiClientError(
      {
        code: 'CONFLICT',
        message: 'Location code already exists in branch.',
        trace_id: 'tr-loc-409',
        details: [{ field: 'location_code', issue: 'Must be unique' }],
      },
      409
    );
    expect(applyCreateLocationFormApiError(err409, createSetError)).toBe(
      'Location code already exists in branch. (Trace: tr-loc-409)'
    );

    const err403Branch = new ApiClientError(
      {
        code: 'FORBIDDEN_BRANCH',
        message: 'Branch access denied.',
        trace_id: 'tr-loc-403',
        details: [{ field: 'branch_id', issue: 'Not assigned to this branch' }],
      },
      403
    );
    expect(applyCreateLocationFormApiError(err403Branch, createSetError)).toBe(
      'Branch access denied. (Trace: tr-loc-403)'
    );

    const err400 = new ApiClientError(
      {
        code: 'MALFORMED_REQUEST',
        message: 'Missing Idempotency-Key header.',
        trace_id: 'tr-loc-400',
        details: [
          {
            field: 'Idempotency-Key',
            issue: 'The idempotency key is required.',
          },
        ],
      },
      400
    );
    expect(applyCreateLocationFormApiError(err400, createSetError)).toBe(
      'Missing Idempotency-Key header. (Trace: tr-loc-400)'
    );

    const editSetError = vi.fn<UseFormSetError<EditLocationFormValues>>();
    const editErr = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Location validation failed',
        details: [
          { field: 'name', issue: 'Required' },
          { field: 'is_sellable', issue: 'Cannot mark non-sellable location' },
          { field: 'is_active', issue: 'Cannot deactivate active stock' },
        ],
      },
      422
    );
    expect(applyEditLocationFormApiError(editErr, editSetError)).toBeNull();
    expect(editSetError).toHaveBeenCalledWith('name', {
      type: 'server',
      message: 'Required',
    });
    expect(editSetError).toHaveBeenCalledWith('is_sellable', {
      type: 'server',
      message: 'Cannot mark non-sellable location',
    });
    expect(editSetError).toHaveBeenCalledWith('is_active', {
      type: 'server',
      message: 'Cannot deactivate active stock',
    });

    // Immutable fields (location_code / location_type) on edit surface in banner
    expect(
      applyLocationFormApiError(
        new ApiClientError(
          {
            code: 'VALIDATION_ERROR',
            message: 'Cannot change location_type',
            trace_id: 'tr-edit-unmapped',
            details: [{ field: 'location_type', issue: 'Immutable' }],
          },
          422
        ),
        editSetError,
        'edit'
      )
    ).toBe('Cannot change location_type (Trace: tr-edit-unmapped)');

    expect(
      applyLocationFormApiError(new Error('network'), createSetError)
    ).toBe('Unable to save inventory location. Please try again.');
  });

  it('maps adjustment 422, 422 EXPIRY_POLICY_VIOLATION, 409 OUT_OF_STOCK/CONFLICT, 403 FORBIDDEN, and 400 MALFORMED_REQUEST', () => {
    const setError = vi.fn<UseFormSetError<InventoryAdjustmentFormValues>>();

    const err422 = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Invalid adjustment',
        details: [
          { field: 'reason_code', issue: 'Reason required' },
          { field: 'note', issue: 'Note too long' },
          { field: 'reverses_inventory_txn_id', issue: 'Invalid txn' },
          { field: 'lines[0].product_id', issue: 'Unknown product' },
          { field: 'lines[0].product_uom_id', issue: 'Invalid UOM' },
          { field: 'lines[0].location_id', issue: 'Wrong branch' },
          { field: 'lines[0].batch_number', issue: 'Batch required' },
          { field: 'lines[0].manufactured_on', issue: 'Invalid date' },
          { field: 'lines[0].expires_on', issue: 'Invalid expiry' },
          { field: 'lines[0].entered_qty', issue: 'Must be > 0' },
          { field: 'lines[1].unit_cost_entered', issue: 'Cost required' },
        ],
      },
      422
    );

    expect(applyAdjustmentFormApiError(err422, setError)).toBeNull();
    expect(setError).toHaveBeenCalledWith('reason_code', {
      type: 'server',
      message: 'Reason required',
    });
    expect(setError).toHaveBeenCalledWith('note', {
      type: 'server',
      message: 'Note too long',
    });
    expect(setError).toHaveBeenCalledWith('reverses_inventory_txn_id', {
      type: 'server',
      message: 'Invalid txn',
    });
    expect(setError).toHaveBeenCalledWith('lines.0.product_id', {
      type: 'server',
      message: 'Unknown product',
    });
    expect(setError).toHaveBeenCalledWith('lines.0.product_uom_id', {
      type: 'server',
      message: 'Invalid UOM',
    });
    expect(setError).toHaveBeenCalledWith('lines.0.location_id', {
      type: 'server',
      message: 'Wrong branch',
    });
    expect(setError).toHaveBeenCalledWith('lines.0.batch_number', {
      type: 'server',
      message: 'Batch required',
    });
    expect(setError).toHaveBeenCalledWith('lines.0.manufactured_on', {
      type: 'server',
      message: 'Invalid date',
    });
    expect(setError).toHaveBeenCalledWith('lines.0.expires_on', {
      type: 'server',
      message: 'Invalid expiry',
    });
    expect(setError).toHaveBeenCalledWith('lines.0.entered_qty', {
      type: 'server',
      message: 'Must be > 0',
    });
    expect(setError).toHaveBeenCalledWith('lines.1.unit_cost_entered', {
      type: 'server',
      message: 'Cost required',
    });

    const outOfStockSetError =
      vi.fn<UseFormSetError<InventoryAdjustmentFormValues>>();
    const errOutOfStock = new ApiClientError(
      {
        code: 'OUT_OF_STOCK',
        message: 'Insufficient stock on shelf.',
        trace_id: 'tr-oos-409',
        details: [
          {
            field: 'lines[0].quantity',
            issue: 'Available on-hand quantity is 10.',
          },
        ],
      },
      409
    );

    expect(applyAdjustmentFormApiError(errOutOfStock, outOfStockSetError)).toBe(
      'Insufficient stock on shelf. (Trace: tr-oos-409)'
    );
    expect(outOfStockSetError).toHaveBeenCalledWith('lines.0.entered_qty', {
      type: 'server',
      message: 'Available on-hand quantity is 10.',
    });

    const expirySetError =
      vi.fn<UseFormSetError<InventoryAdjustmentFormValues>>();
    const errExpiry = new ApiClientError(
      {
        code: 'EXPIRY_POLICY_VIOLATION',
        message: 'Cannot receive expired batch into sellable location.',
        trace_id: 'tr-exp-422',
        details: [
          {
            field: 'lines[0].expires_on',
            issue: 'Batch is already expired.',
          },
        ],
      },
      422
    );
    expect(applyAdjustmentFormApiError(errExpiry, expirySetError)).toBe(
      'Cannot receive expired batch into sellable location. (Trace: tr-exp-422)'
    );
    expect(expirySetError).toHaveBeenCalledWith('lines.0.expires_on', {
      type: 'server',
      message: 'Batch is already expired.',
    });

    const errForbidden = new ApiClientError(
      {
        code: 'FORBIDDEN',
        message: 'Cashiers cannot post inventory adjustments.',
        trace_id: 'tr-adj-403',
        details: [],
      },
      403
    );
    expect(applyAdjustmentFormApiError(errForbidden, setError)).toBe(
      'Cashiers cannot post inventory adjustments. (Trace: tr-adj-403)'
    );

    const errMalformed = new ApiClientError(
      {
        code: 'MALFORMED_REQUEST',
        message: 'Invalid JSON request payload.',
        trace_id: 'tr-adj-400',
        details: [],
      },
      400
    );
    expect(applyAdjustmentFormApiError(errMalformed, setError)).toBe(
      'Invalid JSON request payload. (Trace: tr-adj-400)'
    );

    const unmappedErr = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Branch check failed.',
        trace_id: 'tr-branch-422',
        details: [{ field: 'branch_id', issue: 'Forbidden branch' }],
      },
      422
    );
    expect(applyAdjustmentFormApiError(unmappedErr, setError)).toBe(
      'Branch check failed. (Trace: tr-branch-422)'
    );

    expect(applyAdjustmentFormApiError(new Error('boom'), setError)).toBe(
      'Unable to submit inventory adjustment. Please try again.'
    );
  });
});
