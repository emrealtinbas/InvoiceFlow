import { useEffect, useMemo, useRef, type RefObject } from 'react';

import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { Customer } from '../api/types';
import { useDeleteCustomer } from '../hooks/use-customers';
import { describeCustomerDeleteError } from '../utils/customer-errors';
import { CustomerFormAlert } from './customer-form-alert';

interface DeleteCustomerDialogProps {
  customer: Pick<Customer, 'id' | 'name'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs after the server confirms deletion. Navigation/page adjustment belongs here. */
  onDeleted: () => void;
  /** Element that opened the dialog, focused again when it closes. */
  restoreFocusRef?: RefObject<HTMLElement | null> | undefined;
}

export function DeleteCustomerDialog({
  customer,
  open,
  onOpenChange,
  onDeleted,
  restoreFocusRef,
}: DeleteCustomerDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const { mutate, isPending, error, reset } = useDeleteCustomer();
  const deleteError = useMemo(
    () => (error === null ? null : describeCustomerDeleteError(error)),
    [error],
  );

  useEffect(() => {
    if (open) {
      reset();
    }
  }, [open, customer.id, reset]);

  function handleOpenChange(nextOpen: boolean): void {
    if (isPending) {
      return;
    }

    onOpenChange(nextOpen);
  }

  function handleDelete(): void {
    if (isPending) {
      return;
    }

    mutate(customer.id, {
      onSuccess: () => {
        toast.success('Customer deleted.');
        onDeleted();
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          // Deleting is destructive; focus the safe action first.
          event.preventDefault();
          cancelButtonRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          // The dialog is controlled externally rather than by a Dialog.Trigger, so Radix
          // has no trigger to restore focus to unless the caller supplies it.
          event.preventDefault();
          restoreFocusRef?.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Delete customer?</DialogTitle>
          <DialogDescription>
            This permanently deletes <strong className="text-foreground">{customer.name}</strong>.
            This action cannot be undone. Customers that have invoices cannot be deleted.
          </DialogDescription>
        </DialogHeader>

        {deleteError ? (
          <CustomerFormAlert
            message={deleteError.message}
            correlationId={deleteError.correlationId}
          />
        ) : null}

        <DialogFooter>
          <Button
            ref={cancelButtonRef}
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={isPending} onClick={handleDelete}>
            {isPending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 aria-hidden="true" />
                Delete customer
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
