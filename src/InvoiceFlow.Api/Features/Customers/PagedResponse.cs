namespace InvoiceFlow.Api.Features.Customers;

/// <summary>Envelope for paginated collections.</summary>
public sealed record PagedResponse<T>(
    IReadOnlyList<T> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages);
