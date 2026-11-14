import type { InvoiceCalculation } from '../utils/invoice-calculations';
import { formatTryAmount } from '../utils/invoice-calculations';

export function InvoiceTotals({ calculation }: { calculation: InvoiceCalculation | null }) {
  return (
    <aside className="rounded-xl border bg-muted/30 p-5" aria-label="Financial preview">
      <h2 className="font-semibold">Financial preview</h2>
      {calculation === null ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Complete all line values to preview totals.
        </p>
      ) : (
        <dl className="mt-4 space-y-3">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>{formatTryAmount(calculation.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Tax total</dt>
            <dd>{formatTryAmount(calculation.taxTotal)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t pt-3 text-lg font-semibold">
            <dt>Grand total</dt>
            <dd>{formatTryAmount(calculation.grandTotal)}</dd>
          </div>
        </dl>
      )}
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Preview only. The backend recalculates and persists authoritative TRY totals.
      </p>
    </aside>
  );
}
