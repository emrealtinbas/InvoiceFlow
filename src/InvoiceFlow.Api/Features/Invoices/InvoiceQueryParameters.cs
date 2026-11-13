using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;

namespace InvoiceFlow.Api.Features.Invoices;

/// <summary>Database-side invoice filtering, sorting, and pagination options.</summary>
public sealed class InvoiceQueryParameters : IValidatableObject
{
    [Range(1, int.MaxValue)]
    [FromQuery(Name = "pageNumber")]
    public int PageNumber { get; set; } = 1;

    [Range(1, 100)]
    [FromQuery(Name = "pageSize")]
    public int PageSize { get; set; } = 20;

    [FromQuery(Name = "customerId")]
    public Guid? CustomerId { get; set; }

    [FromQuery(Name = "status")]
    public string? Status { get; set; }

    [FromQuery(Name = "issueDateFrom")]
    public DateOnly? IssueDateFrom { get; set; }

    [FromQuery(Name = "issueDateTo")]
    public DateOnly? IssueDateTo { get; set; }

    [FromQuery(Name = "search")]
    public string? Search { get; set; }

    /// <summary>invoiceNumber, issueDate, dueDate, grandTotal, or createdAt.</summary>
    [FromQuery(Name = "sortBy")]
    public string? SortBy { get; set; }

    /// <summary>asc or desc.</summary>
    [FromQuery(Name = "sortDirection")]
    public string? SortDirection { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (IssueDateFrom is not null &&
            IssueDateTo is not null &&
            IssueDateFrom > IssueDateTo)
        {
            yield return new ValidationResult(
                "IssueDateFrom must be on or before IssueDateTo.",
                [nameof(IssueDateFrom), nameof(IssueDateTo)]);
        }
    }
}
