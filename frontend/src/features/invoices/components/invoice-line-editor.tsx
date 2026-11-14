import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import type { InvoiceFormValues } from '../schemas/invoice-schema';
import type { InvoiceLineCalculation } from '../utils/invoice-calculations';
import { formatTryAmount } from '../utils/invoice-calculations';

interface InvoiceLineEditorProps {
  index: number;
  register: UseFormRegister<InvoiceFormValues>;
  errors: FieldErrors<InvoiceFormValues>;
  calculation?: InvoiceLineCalculation | undefined;
  canRemove: boolean;
  disabled: boolean;
  onRemove: () => void;
}

export function InvoiceLineEditor({
  index,
  register,
  errors,
  calculation,
  canRemove,
  disabled,
  onRemove,
}: InvoiceLineEditorProps) {
  const itemErrors = errors.items?.[index];
  const field = (name: 'description' | 'quantity' | 'unitPrice' | 'taxRate') =>
    `invoice-item-${index}-${name}`;
  const errorId = (name: 'description' | 'quantity' | 'unitPrice' | 'taxRate') =>
    `${field(name)}-error`;

  return (
    <fieldset className="space-y-4 rounded-xl border p-4">
      <legend className="px-1 text-sm font-semibold">Line {index + 1}</legend>
      <div className="grid gap-4 lg:grid-cols-[minmax(12rem,2fr)_minmax(7rem,0.8fr)_minmax(8rem,1fr)_minmax(7rem,0.8fr)_auto]">
        <div className="space-y-2">
          <Label
            htmlFor={field('description')}
            className="after:ml-0.5 after:text-destructive after:content-['*']"
          >
            Description
          </Label>
          <Input
            id={field('description')}
            maxLength={500}
            required
            disabled={disabled}
            aria-invalid={itemErrors?.description ? true : undefined}
            aria-describedby={itemErrors?.description ? errorId('description') : undefined}
            {...register(`items.${index}.description`)}
          />
          {itemErrors?.description?.message ? (
            <p id={errorId('description')} role="alert" className="text-sm text-destructive">
              {itemErrors.description.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label
            htmlFor={field('quantity')}
            className="after:ml-0.5 after:text-destructive after:content-['*']"
          >
            Quantity
          </Label>
          <Input
            id={field('quantity')}
            inputMode="decimal"
            required
            disabled={disabled}
            aria-invalid={itemErrors?.quantity ? true : undefined}
            aria-describedby={itemErrors?.quantity ? errorId('quantity') : undefined}
            {...register(`items.${index}.quantity`)}
          />
          {itemErrors?.quantity?.message ? (
            <p id={errorId('quantity')} role="alert" className="text-sm text-destructive">
              {itemErrors.quantity.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label
            htmlFor={field('unitPrice')}
            className="after:ml-0.5 after:text-destructive after:content-['*']"
          >
            Unit price (TRY)
          </Label>
          <Input
            id={field('unitPrice')}
            inputMode="decimal"
            required
            disabled={disabled}
            aria-invalid={itemErrors?.unitPrice ? true : undefined}
            aria-describedby={itemErrors?.unitPrice ? errorId('unitPrice') : undefined}
            {...register(`items.${index}.unitPrice`)}
          />
          {itemErrors?.unitPrice?.message ? (
            <p id={errorId('unitPrice')} role="alert" className="text-sm text-destructive">
              {itemErrors.unitPrice.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label
            htmlFor={field('taxRate')}
            className="after:ml-0.5 after:text-destructive after:content-['*']"
          >
            Tax rate (%)
          </Label>
          <Input
            id={field('taxRate')}
            inputMode="decimal"
            required
            disabled={disabled}
            aria-invalid={itemErrors?.taxRate ? true : undefined}
            aria-describedby={itemErrors?.taxRate ? errorId('taxRate') : undefined}
            {...register(`items.${index}.taxRate`)}
          />
          {itemErrors?.taxRate?.message ? (
            <p id={errorId('taxRate')} role="alert" className="text-sm text-destructive">
              {itemErrors.taxRate.message}
            </p>
          ) : null}
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Remove line ${index + 1}`}
            disabled={!canRemove || disabled}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <div
        className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground"
        aria-live="polite"
      >
        <span>Net: {calculation ? formatTryAmount(calculation.lineSubtotal) : '—'}</span>
        <span>Tax: {calculation ? formatTryAmount(calculation.lineTax) : '—'}</span>
        <span className="font-medium text-foreground">
          Total: {calculation ? formatTryAmount(calculation.lineTotal) : '—'}
        </span>
      </div>
    </fieldset>
  );
}
