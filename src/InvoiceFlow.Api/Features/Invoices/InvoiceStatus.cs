namespace InvoiceFlow.Api.Features.Invoices;

/// <summary>
/// Lifecycle state of an invoice. Persisted as a stable string value.
/// </summary>
public enum InvoiceStatus
{
    Draft,
    Sent,
    Paid,
    Cancelled,
}
