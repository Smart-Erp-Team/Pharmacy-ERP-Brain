import { Controller, type Control, type FieldErrors } from 'react-hook-form';
import { Input } from '../../../components/ui/Input';
import { Select, type SelectOption } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import type { AdjustmentsTxnType, InventoryTxn } from '../../../types/api';
import { isAdjustmentTxnType } from '../hooks/useAdjustmentForm';
import type { InventoryAdjustmentFormValues } from '../schemas/inventoryAdjustmentSchema';

const TRANSACTION_TYPE_OPTIONS: readonly SelectOption[] = [
  { value: 'OPENING_BALANCE', label: 'Opening balance (OPENING_BALANCE)' },
  { value: 'ADJUSTMENT_IN', label: 'Adjustment in (ADJUSTMENT_IN)' },
  { value: 'ADJUSTMENT_OUT', label: 'Adjustment out (ADJUSTMENT_OUT)' },
  { value: 'REVERSAL', label: 'Reversal (REVERSAL)' },
];

export interface AdjustmentFormHeaderProps {
  transactionType: AdjustmentsTxnType;
  reversesTxnId: string;
  disabled: boolean;
  reversibleTransactions: readonly InventoryTxn[];
  control: Control<InventoryAdjustmentFormValues>;
  errors: FieldErrors<InventoryAdjustmentFormValues>;
  onTransactionTypeChange: (nextType: AdjustmentsTxnType) => void;
  onReversalTargetChange: (nextTxnId: string) => void;
}

export function AdjustmentFormHeader({
  transactionType,
  reversesTxnId,
  disabled,
  reversibleTransactions,
  control,
  errors,
  onTransactionTypeChange,
  onReversalTargetChange,
}: AdjustmentFormHeaderProps) {
  const reversalOptions: SelectOption[] = [
    { value: '', label: 'Select posted transaction...' },
    ...reversibleTransactions.map((txn) => ({
      value: txn.inventory_txn_id,
      label: `${txn.transaction_no} · ${txn.transaction_type}${txn.reason_code ? ` (${txn.reason_code})` : ''}`,
    })),
  ];

  if (
    reversesTxnId &&
    !reversibleTransactions.some(
      (txn) => txn.inventory_txn_id === reversesTxnId
    )
  ) {
    reversalOptions.push({
      value: reversesTxnId,
      label: `Transaction ${reversesTxnId.slice(0, 8)}`,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Select
        label="Transaction type"
        name="transaction_type"
        options={TRANSACTION_TYPE_OPTIONS}
        value={transactionType}
        onChange={(event) => {
          const candidate = event.target.value;
          if (isAdjustmentTxnType(candidate)) {
            onTransactionTypeChange(candidate);
          }
        }}
        disabled={disabled}
        error={errors.transaction_type?.message}
      />

      <Controller
        name="reason_code"
        control={control}
        render={({ field }) => (
          <Input
            label="Reason code"
            name={field.name}
            placeholder={
              transactionType === 'REVERSAL'
                ? 'Optional (e.g. AUDIT_REVERSAL)'
                : 'e.g. INITIAL_COUNT, CYCLE_COUNT_SURPLUS'
            }
            maxLength={40}
            value={field.value}
            onBlur={field.onBlur}
            onChange={(event) => field.onChange(event.target.value)}
            disabled={disabled}
            hint={
              transactionType === 'REVERSAL'
                ? 'Optional for reversal transactions.'
                : undefined
            }
            error={errors.reason_code?.message}
          />
        )}
      />

      {transactionType === 'REVERSAL' ? (
        <div className="md:col-span-2">
          <Select
            label="Original transaction to reverse"
            name="reverses_inventory_txn_id"
            options={reversalOptions}
            value={reversesTxnId}
            onChange={(event) => onReversalTargetChange(event.target.value)}
            disabled={disabled}
            hint="Select a POSTED non-reversal transaction from this branch to negate its lines."
            error={errors.reverses_inventory_txn_id?.message}
          />
        </div>
      ) : null}

      <div className="md:col-span-2">
        <Controller
          name="note"
          control={control}
          render={({ field }) => (
            <Textarea
              label="Note"
              name={field.name}
              placeholder="Optional audit note (up to 500 characters)"
              maxLength={500}
              rows={2}
              value={field.value}
              onBlur={field.onBlur}
              onChange={(event) => field.onChange(event.target.value)}
              disabled={disabled}
              error={errors.note?.message}
            />
          )}
        />
      </div>
    </div>
  );
}
