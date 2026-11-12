using System.ComponentModel.DataAnnotations;

namespace InvoiceFlow.Api.Features.Customers;

/// <summary>Pagination, search, and sorting options for the customer list.</summary>
public sealed class CustomerQueryParameters
{
    [Range(1, int.MaxValue)]
    public int Page { get; set; } = 1;

    [Range(1, 100)]
    public int PageSize { get; set; } = 20;

    /// <summary>Case-insensitive term matched against name, e-mail, and tax number.</summary>
    public string? Search { get; set; }

    /// <summary>One of <c>name</c> (default), <c>email</c>, <c>createdAt</c>, <c>updatedAt</c>.</summary>
    public string? SortBy { get; set; }

    /// <summary><c>asc</c> (default) or <c>desc</c>.</summary>
    public string? SortDirection { get; set; }
}
