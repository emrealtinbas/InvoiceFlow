namespace InvoiceFlow.Api.Features.Invoices;

/// <summary>Defines the complete set of allowed invoice status transitions.</summary>
public sealed class InvoiceLifecycle
{
    public bool CanTransition(InvoiceStatus current, InvoiceStatus target) =>
        (current, target) switch
        {
            (InvoiceStatus.Draft, InvoiceStatus.Sent) => true,
            (InvoiceStatus.Sent, InvoiceStatus.Paid) => true,
            (InvoiceStatus.Draft, InvoiceStatus.Cancelled) => true,
            (InvoiceStatus.Sent, InvoiceStatus.Cancelled) => true,
            _ => false,
        };
}
