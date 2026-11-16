import { Toggle } from '../../../components/ui/Toggle';

export interface EditUserStatusFieldProps {
  isActive: boolean;
  disabled: boolean;
  error?: string;
  onChange: (nextActive: boolean) => void;
}

export function EditUserStatusField({
  isActive,
  disabled,
  error,
  onChange,
}: EditUserStatusFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Toggle
        label="Active account"
        description="Inactive accounts cannot sign in while historical audit records remain intact."
        checked={isActive}
        onChange={onChange}
        disabled={disabled}
      />
      {error ? (
        <p role="alert" className="text-body-sm text-danger font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}
