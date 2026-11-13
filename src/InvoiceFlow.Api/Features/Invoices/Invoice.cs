using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Customers;
using InvoiceFlow.Api.Infrastructure.Persistence;

namespace InvoiceFlow.Api.Features.Invoices;

/// <summary>
/// An invoice issued to a customer. Phase 5 calculates totals; Phase 6 handles lifecycle transitions.
/// </summary>
public sealed class Invoice : IAuditableEntity
{
    public Guid Id { get; set; }

    public Guid OwnerId { get; set; }

    public Guid CustomerId { get; set; }

    public required string InvoiceNumber { get; set; }

    public DateOnly IssueDate { get; set; }

    public DateOnly DueDate { get; set; }

    public InvoiceStatus Status { get; set; } = InvoiceStatus.Draft;

    public string Currency { get; set; } = "TRY";

    public decimal Subtotal { get; set; }

    public decimal TaxTotal { get; set; }

    public decimal GrandTotal { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// Optimistic concurrency token. Mapped to PostgreSQL's internal <c>xmin</c>
    /// system column, so no physical column is created for it.
    /// </summary>
    public uint Version { get; set; }

    public ApplicationUser Owner { get; set; } = null!;

    public Customer Customer { get; set; } = null!;

    public ICollection<InvoiceItem> Items { get; } = [];
}
