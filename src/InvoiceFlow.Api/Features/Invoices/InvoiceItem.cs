namespace InvoiceFlow.Api.Features.Invoices;

/// <summary>
/// A single line on an invoice. Financial values are calculated in Phase 5.
/// </summary>
public sealed class InvoiceItem
{
    public Guid Id { get; set; }

    public Guid InvoiceId { get; set; }

    public required string Description { get; set; }

    public decimal Quantity { get; set; }

    public decimal UnitPrice { get; set; }

    public decimal TaxRate { get; set; }

    public decimal LineSubtotal { get; set; }

    public decimal LineTax { get; set; }

    public decimal LineTotal { get; set; }

    public Invoice Invoice { get; set; } = null!;
}
