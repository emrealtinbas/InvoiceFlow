import type { ComponentProps } from 'react';

import type { UseFormRegisterReturn } from 'react-hook-form';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FormFieldProps {
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
  type?: ComponentProps<'input'>['type'];
  autoComplete?: string;
  hint?: string;
  error?: string | undefined;
  disabled?: boolean;
}

/** Accessible labelled input with stable hint and error IDs. */
export function FormField({
  id,
  label,
  registration,
  type = 'text',
  autoComplete,
  hint,
  error,
  disabled,
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...registration}
      />
      {hint ? (
        <p id={hintId} className="text-xs leading-5 text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
