using System.Text.Json.Serialization;

namespace InvoiceFlow.Api.Features.Invoices;

/// <summary>
/// Lifecycle state of an invoice. Persisted as a stable string value.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter<InvoiceStatus>))]
public enum InvoiceStatus
{
    Draft,
    Sent,
    Paid,
    Cancelled,
}
