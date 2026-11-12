using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Invoices;
using InvoiceFlow.Api.Infrastructure.Persistence;

namespace InvoiceFlow.Api.Features.Customers;

/// <summary>
/// A customer owned by exactly one application user.
/// </summary>
public sealed class Customer : IAuditableEntity
{
    public Guid Id { get; set; }

    public Guid OwnerId { get; set; }

    public required string Name { get; set; }

    public string? Email { get; set; }

    public string? Phone { get; set; }

    public string? Address { get; set; }

    public string? TaxNumber { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public ApplicationUser Owner { get; set; } = null!;

    public ICollection<Invoice> Invoices { get; } = [];
}
