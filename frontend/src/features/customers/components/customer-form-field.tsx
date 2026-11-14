import type { ComponentProps } from 'react';

import type { UseFormRegisterReturn } from 'react-hook-form';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import type { CustomerFormField } from '../schemas/customer-schemas';

interface CustomerFormFieldProps {
  id: string;
  label: string;
  registration: UseFormRegisterReturn<CustomerFormField>;
  type?: ComponentProps<'input'>['type'];
  autoComplete?: string;
  hint?: string;
  error?: string | undefined;
  required?: boolean;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
  inputMode?: ComponentProps<'input'>['inputMode'];
}

/** Labelled field with stable hint and error identifiers for assistive technology. */
export function CustomerFormField({
  id,
  label,
  registration,
  type = 'text',
  autoComplete,
  hint,
  error,
  required = false,
  multiline = false,
  maxLength,
  placeholder,
  inputMode,
}: CustomerFormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const sharedProps = {
    id,
    autoComplete,
    required,
    maxLength,
    placeholder,
    inputMode,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': describedBy,
    'aria-required': required || undefined,
    ...registration,
  };

  return (
    <div className="space-y-2">
      <Label
        htmlFor={id}
        className={required ? "after:ml-0.5 after:text-destructive after:content-['*']" : undefined}
      >
        {label}
      </Label>
      {multiline ? <Textarea {...sharedProps} /> : <Input type={type} {...sharedProps} />}
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
