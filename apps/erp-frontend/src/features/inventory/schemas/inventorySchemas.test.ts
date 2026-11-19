/** @vitest-environment jsdom */
import { zodResolver } from '@hookform/resolvers/zod';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useForm, type UseFormSetError } from 'react-hook-form';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../../../lib/api/client';
import type { InventoryLocationDto, InventoryTxnDto } from '../../../types/api';
import {
  compareDecimalStrings,
  createEmptyAdjustmentLine,
  DEFAULT_ADJUSTMENT_FORM_VALUES,
  DEFAULT_ADJUSTMENT_LINE,
  formatFixed4,
  formatNonNegativeNumeric4,
  formatNumericDisplay,
  formatPositiveNumeric4,
  formatScaled4,
  inventoryAdjustmentFormSchema,
  inventoryTxnDtoToPatchFormValues,
  multiplyToFixed4,
  parseScaled4,
  sumDecimalStrings,
  toInventoryTxnPatchPayload,
  toInventoryTxnPayload,
  type InventoryAdjustmentFormValues,
} from './inventoryAdjustmentSchema';
import {
  applyAdjustmentFormApiError,
  applyCreateLocationFormApiError,
  applyEditLocationFormApiError,
  applyLocationFormApiError,
} from './inventoryErrorMapper';
import {
  createLocationFormSchema,
  DEFAULT_LOCATION_FORM_VALUES,
  editLocationFormSchema,
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
  it('validates createLocationFormSchema and builds InventoryLocationRequest', () => {
    expect(LOCATION_TYPES).toEqual(['SELLABLE', 'QUARANTINE', 'SCRAP']);

    const parsed = createLocationFormSchema.parse({
      location_code: '  CAI-FRIDGE-1  ',
      name: '  Cold Chain Fridge  ',
      location_type: 'SELLABLE',
      is_active: true,
    });

    expect(
      toCreateLocationPayload(parsed, ' d4e5f6a7-3333-4c44-9d55-bbccddeeffaa ')
    ).toEqual({
      branch_id: 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa',
      location_code: 'CAI-FRIDGE-1',
      name: 'Cold Chain Fridge',
      location_type: 'SELLABLE',
      is_active: true,
    });

    const invalid = createLocationFormSchema.safeParse({
      ...DEFAULT_LOCATION_FORM_VALUES,
      location_code: 'C'.repeat(31),
      name: 'N'.repeat(101),
      location_type: 'DAMAGED',
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      const paths = invalid.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('location_code');
      expect(paths).toContain('name');
      expect(paths).toContain('location_type');
    }

    const blankRequired = createLocationFormSchema.safeParse({
      location_code: '   ',
      name: '   ',
      location_type: 'QUARANTINE',
      is_active: true,
    });
    expect(blankRequired.success).toBe(false);
  });

  it('converts InventoryLocationDto to EditLocationFormValues and omits immutable location_code on patch', () => {
    const location: InventoryLocationDto = {
      location_id: '2f31c9d4-7070-4a10-8b2d-ce0f1a2b3c14',
      branch_id: 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa',
      location_code: 'MAIN-SELL',
      name: 'Main Pharmacy Shelf',
      location_type: 'SELLABLE',
      is_sellable: true,
      is_active: true,
    };

    const formValues = locationDtoToFormValues(location);
    expect(formValues).toEqual({
      name: 'Main Pharmacy Shelf',
      location_type: 'SELLABLE',
      is_active: true,
    });
    expect('location_code' in formValues).toBe(false);

    const parsedEdit = editLocationFormSchema.parse({
      ...formValues,
      name: '  Quarantine Reassigned Shelf  ',
      location_type: 'QUARANTINE',
      is_active: false,
    });
    const patchPayload = toLocationPatchPayload(parsedEdit);
    expect(patchPayload).toEqual({
      name: 'Quarantine Reassigned Shelf',
      location_type: 'QUARANTINE',
      is_active: false,
    });
    expect('location_code' in patchPayload).toBe(false);
  });

  it('integrates createLocationFormSchema with React Hook Form zodResolver', async () => {
    const { result } = renderHook(() => {
      const form = useForm<CreateLocationFormValues>({
        resolver: zodResolver(createLocationFormSchema),
        defaultValues: DEFAULT_LOCATION_FORM_VALUES,
      });
      return {
        trigger: form.trigger,
        codeError: form.formState.errors.location_code?.message,
        nameError: form.formState.errors.name?.message,
      };
    });

    let valid = true;
    await act(async () => {
      valid = await result.current.trigger();
    });
    expect(valid).toBe(false);
    await waitFor(() => {
      expect(result.current.codeError).toBe('Location code is required');
      expect(result.current.nameError).toBe('Location name is required');
    });
  });
});

describe('BigInt decimal helpers in inventoryAdjustmentSchema', () => {
  it('parses and formats scaled-4 decimals without float drift and rejects -0', () => {
    expect(parseScaled4('5000.0000')).toBe(50000000n);
    expect(parseScaled4('1.2052')).toBe(12052n);
    expect(parseScaled4('-10.5')).toBe(-105000n);
    expect(parseScaled4('.25')).toBe(2500n);
    expect(parseScaled4('0')).toBe(0n);
    expect(parseScaled4('0.0000')).toBe(0n);
    expect(parseScaled4('-0')).toBeNull();
    expect(parseScaled4('-0.0')).toBeNull();
    expect(parseScaled4('-0.0000')).toBeNull();
    expect(parseScaled4('1.23456')).toBeNull();
    expect(parseScaled4('not-a-number')).toBeNull();

    expect(formatScaled4(50000000n)).toBe('5000.0000');
    expect(formatScaled4(-105000n)).toBe('-10.5000');
    expect(formatScaled4(0n)).toBe('0.0000');

    expect(formatFixed4('12')).toBe('12.0000');
    expect(formatFixed4('007.5')).toBe('7.5000');
    expect(formatFixed4('1.23455')).toBe('1.2346');
    expect(formatFixed4('-0')).toBe('0.0000');
    expect(formatFixed4('invalid')).toBe('0.0000');

    expect(formatPositiveNumeric4('10')).toBe('10.0000');
    expect(formatPositiveNumeric4('.5')).toBe('0.5000');
    expect(formatPositiveNumeric4('99999999999999.9999')).toBe(
      '99999999999999.9999'
    );
    expect(formatPositiveNumeric4('0')).toBeNull();
    expect(formatPositiveNumeric4('0.0000')).toBeNull();
    expect(formatPositiveNumeric4('-0')).toBeNull();
    expect(formatPositiveNumeric4('-5')).toBeNull();
    expect(formatPositiveNumeric4('1.23456')).toBeNull();
    expect(formatPositiveNumeric4('100000000000000')).toBeNull();

    expect(formatNonNegativeNumeric4('0')).toBe('0.0000');
    expect(formatNonNegativeNumeric4('0.0000')).toBe('0.0000');
    expect(formatNonNegativeNumeric4('1.2052')).toBe('1.2052');
    expect(formatNonNegativeNumeric4('-0')).toBeNull();
    expect(formatNonNegativeNumeric4('-0.0001')).toBeNull();
  });

  it('compares, sums, multiplies, and formats display values with exact BigInt arithmetic', () => {
    expect(compareDecimalStrings('5000.0000', '5000')).toBe(0);
    expect(
      compareDecimalStrings('99999999999999.9999', '99999999999999.9998')
    ).toBe(1);
    expect(compareDecimalStrings('-10.5', '-2.1')).toBe(-1);
    expect(compareDecimalStrings('-1', '0')).toBe(-1);
    expect(() => compareDecimalStrings('-0', '0')).toThrow(RangeError);

    expect(
      sumDecimalStrings([
        '99999999999990.0001',
        '9.9998',
        '',
        'invalid',
        '0.0000',
      ])
    ).toBe('99999999999999.9999');
    expect(sumDecimalStrings(['0.1', '0.2'])).toBe('0.3000');
    expect(sumDecimalStrings(['-5.25', '2.25'])).toBe('-3.0000');
    expect(sumDecimalStrings([])).toBe('0.0000');

    expect(multiplyToFixed4('2.0000', '14.000000')).toBe('28.0000');
    expect(multiplyToFixed4('0.1', '0.2')).toBe('0.0200');
    expect(multiplyToFixed4('9999999999.0001', '1.000000')).toBe(
      '9999999999.0001'
    );

    expect(formatNumericDisplay(null)).toBe('Unavailable');
    expect(formatNumericDisplay(undefined)).toBe('Unavailable');
    expect(formatNumericDisplay('   ', { fallback: '—' })).toBe('—');
    expect(formatNumericDisplay('5000.0000')).toBe('5,000');
    expect(formatNumericDisplay('1.2052')).toBe('1.2052');
    expect(
      formatNumericDisplay('1.2052', { minDecimals: 2, maxDecimals: 2 })
    ).toBe('1.21');
    expect(
      formatNumericDisplay('12.0000', { minDecimals: 2, maxDecimals: 4 })
    ).toBe('12.00');
    expect(formatNumericDisplay('99999999999999.9999')).toBe(
      '99,999,999,999,999.9999'
    );
  });
});

describe('inventoryAdjustmentFormSchema and payload converters', () => {
  const sampleLine = {
    product_id: 'f6a7b8c9-4444-4eee-9c3d-456789012abc',
    location_id: '2f31c9d4-7070-4a10-8b2d-ce0f1a2b3c14',
    batch_id: '3a42d0e5-8080-4b2f-8d4a-3c4d5e6f8a16',
    product_uom_id: 'c1d2e3f4-1111-4aaa-8a1b-111111110002',
    entered_qty: ' 2.5 ',
    unit_cost_base: ' 0 ',
  };

  it('requires unit_cost_base on OPENING_BALANCE and ADJUSTMENT_IN and formats 4dp payloads', () => {
    const missingCost = inventoryAdjustmentFormSchema.safeParse({
      ...DEFAULT_ADJUSTMENT_FORM_VALUES,
      transaction_type: 'OPENING_BALANCE',
      reason_code: 'INITIAL_COUNT',
      lines: [{ ...sampleLine, unit_cost_base: '   ' }],
    });
    expect(missingCost.success).toBe(false);
    if (!missingCost.success) {
      expect(missingCost.error.issues[0]?.path).toEqual([
        'lines',
        0,
        'unit_cost_base',
      ]);
    }

    const parsedIn = inventoryAdjustmentFormSchema.parse({
      transaction_type: 'ADJUSTMENT_IN',
      reason_code: ' FOUND_STOCK ',
      note: '   ',
      reverses_inventory_txn_id: '',
      lines: [sampleLine],
    });

    expect(
      toInventoryTxnPayload(parsedIn, ' d4e5f6a7-3333-4c44-9d55-bbccddeeffaa ')
    ).toEqual({
      transaction_type: 'ADJUSTMENT_IN',
      branch_id: 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa',
      reason_code: 'FOUND_STOCK',
      note: null,
      reverses_inventory_txn_id: null,
      lines: [
        {
          product_id: 'f6a7b8c9-4444-4eee-9c3d-456789012abc',
          location_id: '2f31c9d4-7070-4a10-8b2d-ce0f1a2b3c14',
          batch_id: '3a42d0e5-8080-4b2f-8d4a-3c4d5e6f8a16',
          product_uom_id: 'c1d2e3f4-1111-4aaa-8a1b-111111110002',
          entered_qty: '2.5000',
          unit_cost_base: '0.0000',
        },
      ],
    });
  });

  it('omits unit_cost_base on ADJUSTMENT_OUT and REVERSAL and enforces reversal UUID', () => {
    const parsedOut = inventoryAdjustmentFormSchema.parse({
      transaction_type: 'ADJUSTMENT_OUT',
      reason_code: 'DAMAGED_REMOVAL',
      note: 'Broken blister pack',
      reverses_inventory_txn_id: '',
      lines: [{ ...sampleLine, unit_cost_base: '99.0000' }],
    });

    const outPayload = toInventoryTxnPayload(
      parsedOut,
      'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa'
    );
    expect(outPayload.lines[0]?.unit_cost_base).toBeUndefined();
    expect('unit_cost_base' in (outPayload.lines[0] ?? {})).toBe(false);

    const invalidReversal = inventoryAdjustmentFormSchema.safeParse({
      transaction_type: 'REVERSAL',
      reason_code: 'ENTRY_ERROR',
      note: '',
      reverses_inventory_txn_id: 'not-a-uuid',
      lines: [sampleLine],
    });
    expect(invalidReversal.success).toBe(false);
    if (!invalidReversal.success) {
      expect(invalidReversal.error.issues[0]?.path).toEqual([
        'reverses_inventory_txn_id',
      ]);
    }

    const validReversal = inventoryAdjustmentFormSchema.parse({
      transaction_type: 'REVERSAL',
      reason_code: 'ENTRY_ERROR',
      note: 'Undo wrong count',
      reverses_inventory_txn_id: '7d9503b8-1001-4ca5-8a0b-cd4040620002',
      lines: [{ ...sampleLine, unit_cost_base: '1.2500' }],
    });

    const reversalPayload = toInventoryTxnPayload(
      validReversal,
      'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa'
    );
    expect(reversalPayload.reverses_inventory_txn_id).toBe(
      '7d9503b8-1001-4ca5-8a0b-cd4040620002'
    );
    expect('unit_cost_base' in (reversalPayload.lines[0] ?? {})).toBe(false);
  });

  it('rejects -0, zero qty, >4dp qty/cost, empty lines, and converts DTO to DRAFT patch form', () => {
    const badInputs = inventoryAdjustmentFormSchema.safeParse({
      transaction_type: 'ADJUSTMENT_IN',
      reason_code: 'R'.repeat(41),
      note: 'N'.repeat(501),
      reverses_inventory_txn_id: '',
      lines: [
        { ...sampleLine, entered_qty: '-0', unit_cost_base: '-0' },
        { ...sampleLine, entered_qty: '1.23456', unit_cost_base: '2.34567' },
        { ...sampleLine, entered_qty: '0.0000', unit_cost_base: '-1' },
      ],
    });
    expect(badInputs.success).toBe(false);
    if (!badInputs.success) {
      const paths = badInputs.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('reason_code');
      expect(paths).toContain('note');
      expect(paths).toContain('lines.0.entered_qty');
      expect(paths).toContain('lines.0.unit_cost_base');
      expect(paths).toContain('lines.1.entered_qty');
      expect(paths).toContain('lines.1.unit_cost_base');
      expect(paths).toContain('lines.2.entered_qty');
      expect(paths).toContain('lines.2.unit_cost_base');
    }

    const emptyLines = inventoryAdjustmentFormSchema.safeParse({
      ...DEFAULT_ADJUSTMENT_FORM_VALUES,
      reason_code: 'TEST',
      lines: [],
    });
    expect(emptyLines.success).toBe(false);

    const draftTxn: InventoryTxnDto = {
      inventory_txn_id: '7d9503b8-1001-4ca5-8a0b-cd4040620003',
      branch_id: 'd4e5f6a7-3333-4c44-9d55-bbccddeeffaa',
      transaction_no: 'TXN-2026-000003',
      transaction_type: 'ADJUSTMENT_IN',
      status: 'DRAFT',
      reason_code: 'PENDING_RECOUNT',
      note: 'Draft note',
      posted_at: null,
      reverses_inventory_txn_id: null,
      lines: [
        {
          inventory_txn_line_id: 'line-1',
          product_id: sampleLine.product_id,
          location_id: sampleLine.location_id,
          batch_id: sampleLine.batch_id,
          product_uom_id: sampleLine.product_uom_id,
          entered_qty: '70.0000',
          conversion_snapshot: '1.000000',
          quantity_delta_base: '70.0000',
          unit_cost_base: '1.2500',
        },
      ],
    };

    const draftFormValues = inventoryTxnDtoToPatchFormValues(draftTxn);
    expect(draftFormValues).toEqual({
      transaction_type: 'ADJUSTMENT_IN',
      reason_code: 'PENDING_RECOUNT',
      note: 'Draft note',
      reverses_inventory_txn_id: '',
      lines: [
        {
          product_id: sampleLine.product_id,
          location_id: sampleLine.location_id,
          batch_id: sampleLine.batch_id,
          product_uom_id: sampleLine.product_uom_id,
          entered_qty: '70.0000',
          unit_cost_base: '1.2500',
        },
      ],
    });

    const patchPayload = toInventoryTxnPatchPayload(draftFormValues);
    expect(patchPayload).toEqual({
      reason_code: 'PENDING_RECOUNT',
      note: 'Draft note',
      lines: [
        {
          product_id: sampleLine.product_id,
          location_id: sampleLine.location_id,
          batch_id: sampleLine.batch_id,
          product_uom_id: sampleLine.product_uom_id,
          entered_qty: '70.0000',
          unit_cost_base: '1.2500',
        },
      ],
    });
    expect('transaction_type' in patchPayload).toBe(false);
    expect('branch_id' in patchPayload).toBe(false);
    expect('reverses_inventory_txn_id' in patchPayload).toBe(false);

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
        costError: form.formState.errors.lines?.[0]?.unit_cost_base?.message,
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
  it('maps location 422, 409, unmapped, and non-API errors', () => {
    const createSetError = vi.fn<UseFormSetError<CreateLocationFormValues>>();
    const err422 = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Invalid location',
        details: [
          { field: 'location_code', issue: 'Too long' },
          { field: 'location_type', issue: 'Invalid type' },
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

    const editSetError = vi.fn<UseFormSetError<EditLocationFormValues>>();
    const editErr = new ApiClientError(
      {
        code: 'VALIDATION_ERROR',
        message: 'Location name required',
        details: [{ field: 'name', issue: 'Required' }],
      },
      422
    );
    expect(applyEditLocationFormApiError(editErr, editSetError)).toBeNull();
    expect(
      applyLocationFormApiError(
        new ApiClientError(
          {
            code: 'VALIDATION_ERROR',
            message: 'Cannot change code',
            trace_id: 'tr-edit-unmapped',
            details: [{ field: 'location_code', issue: 'Immutable' }],
          },
          422
        ),
        editSetError,
        'edit'
      )
    ).toBe('Cannot change code (Trace: tr-edit-unmapped)');

    expect(
      applyLocationFormApiError(new Error('network'), createSetError)
    ).toBe('Unable to save inventory location. Please try again.');
  });

  it('maps adjustment details including lines[i].quantity -> lines.i.entered_qty and 409 OUT_OF_STOCK', () => {
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
          { field: 'lines[0].location_id', issue: 'Wrong branch' },
          { field: 'lines[0].batch_id', issue: 'Invalid batch' },
          { field: 'lines[0].product_uom_id', issue: 'Invalid UOM' },
          { field: 'lines[0].entered_qty', issue: 'Must be > 0' },
          { field: 'lines[1].unit_cost_base', issue: 'Cost required' },
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
    expect(setError).toHaveBeenCalledWith('lines.0.location_id', {
      type: 'server',
      message: 'Wrong branch',
    });
    expect(setError).toHaveBeenCalledWith('lines.0.batch_id', {
      type: 'server',
      message: 'Invalid batch',
    });
    expect(setError).toHaveBeenCalledWith('lines.0.product_uom_id', {
      type: 'server',
      message: 'Invalid UOM',
    });
    expect(setError).toHaveBeenCalledWith('lines.0.entered_qty', {
      type: 'server',
      message: 'Must be > 0',
    });
    expect(setError).toHaveBeenCalledWith('lines.1.unit_cost_base', {
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
            issue: 'Available on-hand quantity is 10.0000.',
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
      message: 'Available on-hand quantity is 10.0000.',
    });

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
