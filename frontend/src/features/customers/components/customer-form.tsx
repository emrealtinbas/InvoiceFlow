import { useEffect } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Save } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

import type { CustomerWriteRequest } from '../api/types';
import {
  CUSTOMER_FORM_FIELDS,
  customerFormSchema,
  toCustomerWriteRequest,
  type CustomerFormValues,
} from '../schemas/customer-schemas';
import type { CustomerOperationError } from '../utils/customer-errors';
import { CustomerFormAlert } from './customer-form-alert';
import { CustomerFormField } from './customer-form-field';

interface CustomerFormProps {
  defaultValues: CustomerFormValues;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  serverError: CustomerOperationError | null;
  onSubmit: (request: CustomerWriteRequest) => void;
  cancelTo: string;
  cancelState?: unknown;
}

export function CustomerForm({
  defaultValues,
  submitLabel,
  pendingLabel,
  isPending,
  serverError,
  onSubmit,
  cancelTo,
  cancelState,
}: CustomerFormProps) {
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    setFocus,
    formState: { errors },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues,
    mode: 'onSubmit',
    shouldFocusError: true,
  });

  useEffect(() => {
    if (serverError === null) {
      return;
    }

    const fields = CUSTOMER_FORM_FIELDS.filter(
      (field) => serverError.fieldErrors[field] !== undefined,
    );

    for (const field of fields) {
      const message = serverError.fieldErrors[field];

      if (message !== undefined) {
        setError(field, { type: 'server', message });
      }
    }

    const firstField = fields[0];

    if (firstField !== undefined) {
      setFocus(firstField);
    }
  }, [serverError, setError, setFocus]);

  function handleValid(values: CustomerFormValues): void {
    if (isPending) {
      return;
    }

    clearErrors();
    onSubmit(toCustomerWriteRequest(values));
  }

  return (
    <form
      className="space-y-6"
      noValidate
      aria-busy={isPending}
      onSubmit={handleSubmit(handleValid)}
    >
      {serverError ? (
        <CustomerFormAlert
          message={serverError.message}
          correlationId={serverError.correlationId}
        />
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <CustomerFormField
            id="customer-name"
            label="Customer name"
            required
            autoComplete="organization"
            registration={register('name')}
            error={errors.name?.message}
            hint="Required. Between 2 and 200 characters."
            maxLength={200}
          />
        </div>

        <CustomerFormField
          id="customer-email"
          label="E-mail address"
          type="email"
          autoComplete="email"
          registration={register('email')}
          error={errors.email?.message}
          hint="Optional. Used for invoices and contact."
          maxLength={254}
        />

        <CustomerFormField
          id="customer-phone"
          label="Phone"
          type="tel"
          autoComplete="tel"
          registration={register('phone')}
          error={errors.phone?.message}
          hint="Optional. Digits, spaces, +, -, and parentheses."
          maxLength={30}
        />

        <div className="sm:col-span-2">
          <CustomerFormField
            id="customer-address"
            label="Address"
            autoComplete="street-address"
            registration={register('address')}
            error={errors.address?.message}
            hint="Optional. Up to 500 characters."
            multiline
            maxLength={500}
          />
        </div>

        <CustomerFormField
          id="customer-tax-number"
          label="Tax number"
          inputMode="numeric"
          registration={register('taxNumber')}
          error={errors.taxNumber?.message}
          hint="Optional. 10 or 11 digits."
        />
      </div>

      <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
        {isPending ? (
          <Button type="button" variant="outline" disabled>
            Cancel
          </Button>
        ) : (
          <Button type="button" variant="outline" asChild>
            <Link to={cancelTo} state={cancelState}>
              Cancel
            </Link>
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              {pendingLabel}
            </>
          ) : (
            <>
              <Save aria-hidden="true" />
              {submitLabel}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
