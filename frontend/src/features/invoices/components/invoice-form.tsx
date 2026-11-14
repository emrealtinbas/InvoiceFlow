import { useEffect, useMemo, useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, Save } from 'lucide-react';
import { useFieldArray, useForm, useWatch, type FieldPath } from 'react-hook-form';
import { Link, useBeforeUnload, useBlocker } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  invoiceFormSchema,
  MAX_INVOICE_ITEMS,
  type InvoiceFormValues,
} from '../schemas/invoice-schema';
import { calculateInvoice, type InvoiceCalculation } from '../utils/invoice-calculations';
import type { InvoiceSaveError } from '../utils/invoice-save-errors';
import { CustomerSelector } from './customer-selector';
import { InvoiceLineEditor } from './invoice-line-editor';
import { InvoiceTotals } from './invoice-totals';

interface InvoiceFormProps {
  defaultValues: InvoiceFormValues;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  serverError: InvoiceSaveError | null;
  onSubmit: (values: InvoiceFormValues) => void;
  onReloadConflict?: (() => void) | undefined;
  cancelTo: string;
  cancelState?: unknown;
}

export function InvoiceForm({
  defaultValues,
  submitLabel,
  pendingLabel,
  isPending,
  serverError,
  onSubmit,
  onReloadConflict,
  cancelTo,
  cancelState,
}: InvoiceFormProps) {
  const [allowNavigation, setAllowNavigation] = useState(false);
  const [reloadConfirmationOpen, setReloadConfirmationOpen] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    setFocus,
    formState: { errors, isDirty },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues,
    mode: 'onSubmit',
    shouldFocusError: true,
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchedItems = useWatch({ control, name: 'items' });
  const customerId = useWatch({ control, name: 'customerId' });
  const canLeaveAfterSubmit = allowNavigation && serverError === null;
  const blocker = useBlocker(() => isDirty && !canLeaveAfterSubmit);

  useBeforeUnload((event) => {
    if (isDirty && !canLeaveAfterSubmit) event.preventDefault();
  });

  useEffect(() => {
    if (serverError === null) return;
    const entries = Object.entries(serverError.fieldErrors);
    for (const [path, message] of entries) {
      setError(path as FieldPath<InvoiceFormValues>, { type: 'server', message });
    }
    const first = entries[0]?.[0];
    if (first !== undefined && first !== 'concurrencyToken') {
      setFocus(first as FieldPath<InvoiceFormValues>);
    }
  }, [serverError, setError, setFocus]);

  const calculation = useMemo<InvoiceCalculation | null>(() => {
    try {
      if (
        watchedItems.some(
          (item) =>
            !/^\d+(?:\.\d+)?$/.test(item.quantity) ||
            !/^\d+(?:\.\d+)?$/.test(item.unitPrice) ||
            !/^\d+(?:\.\d+)?$/.test(item.taxRate),
        )
      )
        return null;
      return calculateInvoice(watchedItems);
    } catch {
      return null;
    }
  }, [watchedItems]);

  function submit(values: InvoiceFormValues): void {
    if (isPending) return;
    setAllowNavigation(true);
    onSubmit(values);
  }

  return (
    <>
      <form className="space-y-6" noValidate aria-busy={isPending} onSubmit={handleSubmit(submit)}>
        {serverError ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
          >
            <p className="font-medium text-destructive">Invoice could not be saved</p>
            <p className="mt-1 text-muted-foreground">{serverError.message}</p>
            {serverError.correlationId ? (
              <p className="mt-2 font-mono text-xs">Reference: {serverError.correlationId}</p>
            ) : null}
            {serverError.conflict && onReloadConflict ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setReloadConfirmationOpen(true)}
              >
                Reload latest invoice
              </Button>
            ) : null}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Invoice information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <CustomerSelector
                value={customerId}
                onChange={(value) =>
                  setValue('customerId', value, { shouldDirty: true, shouldValidate: true })
                }
                error={errors.customerId?.message}
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="invoice-issue-date"
                className="after:ml-0.5 after:text-destructive after:content-['*']"
              >
                Issue date
              </Label>
              <Input
                id="invoice-issue-date"
                type="date"
                required
                disabled={isPending}
                aria-invalid={errors.issueDate ? true : undefined}
                aria-describedby={errors.issueDate ? 'invoice-issue-date-error' : undefined}
                {...register('issueDate')}
              />
              {errors.issueDate?.message ? (
                <p id="invoice-issue-date-error" role="alert" className="text-sm text-destructive">
                  {errors.issueDate.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="invoice-due-date"
                className="after:ml-0.5 after:text-destructive after:content-['*']"
              >
                Due date
              </Label>
              <Input
                id="invoice-due-date"
                type="date"
                required
                disabled={isPending}
                aria-invalid={errors.dueDate ? true : undefined}
                aria-describedby={errors.dueDate ? 'invoice-due-date-error' : undefined}
                {...register('dueDate')}
              />
              {errors.dueDate?.message ? (
                <p id="invoice-due-date-error" role="alert" className="text-sm text-destructive">
                  {errors.dueDate.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-currency">Currency</Label>
              <Input id="invoice-currency" value="TRY" readOnly />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Invoice items</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Up to {MAX_INVOICE_ITEMS} lines.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={isPending || fields.length >= MAX_INVOICE_ITEMS}
              onClick={() =>
                append(
                  { description: '', quantity: '1', unitPrice: '0', taxRate: '20' },
                  { shouldFocus: true, focusName: `items.${fields.length}.description` },
                )
              }
            >
              <Plus />
              Add line
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, index) => (
              <InvoiceLineEditor
                key={field.id}
                index={index}
                register={register}
                errors={errors}
                calculation={calculation?.lines[index]}
                canRemove={fields.length > 1}
                disabled={isPending}
                onRemove={() => remove(index)}
              />
            ))}
            {errors.items?.root?.message ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.items.root.message}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <InvoiceTotals calculation={calculation} />

        <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" asChild disabled={isPending}>
            <Link to={cancelTo} state={cancelState}>
              Cancel
            </Link>
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="animate-spin" />
                {pendingLabel}
              </>
            ) : (
              <>
                <Save />
                {submitLabel}
              </>
            )}
          </Button>
        </div>
      </form>

      <Dialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset();
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>
              Your invoice changes have not been saved. Leaving now will discard them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => blocker.state === 'blocked' && blocker.reset()}
            >
              Stay
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setAllowNavigation(true);
                if (blocker.state === 'blocked') blocker.proceed();
              }}
            >
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reloadConfirmationOpen} onOpenChange={setReloadConfirmationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reload the latest invoice?</DialogTitle>
            <DialogDescription>
              Reloading replaces this form with the latest server version and discards your unsaved
              edits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReloadConfirmationOpen(false)}
            >
              Keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setReloadConfirmationOpen(false);
                onReloadConflict?.();
              }}
            >
              Discard and reload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
