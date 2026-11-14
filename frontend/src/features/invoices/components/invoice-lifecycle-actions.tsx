import { useMemo, useRef, useState } from 'react';

import { AlertCircle, Ban, CheckCircle2, Loader2, RefreshCw, Send, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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

import type { Invoice } from '../api/types';
import {
  useCancelInvoice,
  useDeleteInvoice,
  useMarkInvoicePaid,
  useSendInvoice,
} from '../hooks/use-invoices';
import { describeInvoiceLifecycleError } from '../utils/invoice-lifecycle-errors';

type LifecycleAction = 'send' | 'markPaid' | 'cancel' | 'delete';

interface InvoiceLifecycleActionsProps {
  invoice: Invoice;
  fromList: string;
  onReloadLatest: () => Promise<boolean>;
}

const actionContent: Record<
  LifecycleAction,
  { title: string; confirm: string; pending: string; description: (number: string) => string }
> = {
  send: {
    title: 'Send invoice?',
    confirm: 'Mark as Sent',
    pending: 'Sending…',
    description: (number) =>
      `${number} will become Sent and its financial fields can no longer be edited. This changes status only; InvoiceFlow does not send an e-mail.`,
  },
  markPaid: {
    title: 'Mark invoice as Paid?',
    confirm: 'Mark as Paid',
    pending: 'Marking Paid…',
    description: (number) =>
      `${number} will become Paid and reach a terminal state. This is a manual status change, not payment processing.`,
  },
  cancel: {
    title: 'Cancel invoice?',
    confirm: 'Cancel invoice',
    pending: 'Cancelling…',
    description: (number) =>
      `${number} will become Cancelled and cannot be edited or moved to another status.`,
  },
  delete: {
    title: 'Delete Draft invoice?',
    confirm: 'Delete invoice',
    pending: 'Deleting…',
    description: (number) =>
      `${number} and its line items will be permanently deleted. The customer will remain. This action cannot be undone.`,
  },
};

export function InvoiceLifecycleActions({
  invoice,
  fromList,
  onReloadLatest,
}: InvoiceLifecycleActionsProps) {
  const navigate = useNavigate();
  const restoreFocusRef = useRef<HTMLButtonElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [reloading, setReloading] = useState(false);
  const sendMutation = useSendInvoice();
  const paidMutation = useMarkInvoicePaid();
  const cancelMutation = useCancelInvoice();
  const deleteMutation = useDeleteInvoice();

  const mutation =
    action === 'send'
      ? sendMutation
      : action === 'markPaid'
        ? paidMutation
        : action === 'cancel'
          ? cancelMutation
          : deleteMutation;
  const error = useMemo(
    () => (mutation.error === null ? null : describeInvoiceLifecycleError(mutation.error)),
    [mutation.error],
  );
  const isPending = mutation.isPending || reloading;

  function openAction(nextAction: LifecycleAction, trigger: HTMLButtonElement): void {
    sendMutation.reset();
    paidMutation.reset();
    cancelMutation.reset();
    deleteMutation.reset();
    restoreFocusRef.current = trigger;
    setAction(nextAction);
  }

  function handleOpenChange(open: boolean): void {
    if (!open && !isPending) setAction(null);
  }

  function handleConfirm(): void {
    if (action === null || isPending) return;

    if (action === 'delete') {
      deleteMutation.mutate(
        { id: invoice.id, concurrencyToken: invoice.concurrencyToken },
        {
          onSuccess: () => {
            toast.success('Draft invoice deleted.');
            setAction(null);
            navigate(fromList, { replace: true });
          },
        },
      );
      return;
    }

    const selectedMutation =
      action === 'send' ? sendMutation : action === 'markPaid' ? paidMutation : cancelMutation;
    const successMessage =
      action === 'send'
        ? 'Invoice marked as Sent.'
        : action === 'markPaid'
          ? 'Invoice marked as Paid.'
          : 'Invoice cancelled.';

    selectedMutation.mutate(
      { id: invoice.id, request: { concurrencyToken: invoice.concurrencyToken } },
      {
        onSuccess: () => {
          toast.success(successMessage);
          setAction(null);
        },
      },
    );
  }

  async function handleReload(): Promise<void> {
    if (reloading) return;
    setReloading(true);
    const loaded = await onReloadLatest();
    setReloading(false);
    if (loaded) setAction(null);
  }

  const config = action === null ? null : actionContent[action];

  return (
    <>
      {invoice.status === 'Draft' ? (
        <>
          <Button type="button" onClick={(event) => openAction('send', event.currentTarget)}>
            <Send aria-hidden="true" />
            Send
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={(event) => openAction('cancel', event.currentTarget)}
          >
            <Ban aria-hidden="true" />
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={(event) => openAction('delete', event.currentTarget)}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        </>
      ) : null}

      {invoice.status === 'Sent' ? (
        <>
          <Button type="button" onClick={(event) => openAction('markPaid', event.currentTarget)}>
            <CheckCircle2 aria-hidden="true" />
            Mark Paid
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={(event) => openAction('cancel', event.currentTarget)}
          >
            <Ban aria-hidden="true" />
            Cancel
          </Button>
        </>
      ) : null}

      <Dialog open={action !== null} onOpenChange={handleOpenChange}>
        <DialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelButtonRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreFocusRef.current?.focus();
          }}
        >
          {config ? (
            <>
              <DialogHeader>
                <DialogTitle>{config.title}</DialogTitle>
                <DialogDescription>{config.description(invoice.invoiceNumber)}</DialogDescription>
              </DialogHeader>

              {error ? (
                <div
                  role="alert"
                  className="space-y-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <div className="space-y-1">
                      <p>{error.message}</p>
                      {error.correlationId ? (
                        <p className="font-mono text-[11px] opacity-75">
                          Reference: {error.correlationId}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {error.conflict ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={reloading}
                      onClick={() => void handleReload()}
                    >
                      <RefreshCw
                        className={reloading ? 'animate-spin' : undefined}
                        aria-hidden="true"
                      />
                      {reloading ? 'Reloading…' : 'Reload Latest Invoice'}
                    </Button>
                  ) : null}
                </div>
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
                <Button
                  type="button"
                  variant={action === 'cancel' || action === 'delete' ? 'destructive' : 'default'}
                  disabled={isPending}
                  onClick={handleConfirm}
                >
                  {mutation.isPending ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden="true" />
                      {config.pending}
                    </>
                  ) : (
                    config.confirm
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
