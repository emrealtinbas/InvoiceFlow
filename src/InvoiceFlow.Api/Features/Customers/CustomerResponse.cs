using System.Linq.Expressions;

namespace InvoiceFlow.Api.Features.Customers;

/// <summary>
/// Public customer representation. Ownership and Identity data are never exposed.
/// </summary>
public sealed record CustomerResponse(
    Guid Id,
    string Name,
    string? Email,
    string? Phone,
    string? Address,
    string? TaxNumber,
    DateTime CreatedAt,
    DateTime? UpdatedAt)
{
    /// <summary>Database-side projection used by read queries.</summary>
    public static readonly Expression<Func<Customer, CustomerResponse>> Projection =
        customer => new CustomerResponse(
            customer.Id,
            customer.Name,
            customer.Email,
            customer.Phone,
            customer.Address,
            customer.TaxNumber,
            customer.CreatedAt,
            customer.UpdatedAt);

    public static CustomerResponse From(Customer customer) =>
        new(
            customer.Id,
            customer.Name,
            customer.Email,
            customer.Phone,
            customer.Address,
            customer.TaxNumber,
            customer.CreatedAt,
            customer.UpdatedAt);
}
