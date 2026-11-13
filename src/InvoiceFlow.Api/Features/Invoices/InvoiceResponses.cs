namespace InvoiceFlow.Api.Features.Invoices;

public sealed record InvoiceItemResponse(
    Guid Id,
    string Description,
    decimal Quantity,
    decimal UnitPrice,
    decimal TaxRate,
    decimal LineSubtotal,
    decimal LineTax,
    decimal LineTotal);

public sealed record InvoiceResponse(
    Guid Id,
    string InvoiceNumber,
    Guid CustomerId,
    DateOnly IssueDate,
    DateOnly DueDate,
    InvoiceStatus Status,
    string Currency,
    decimal Subtotal,
    decimal TaxTotal,
    decimal GrandTotal,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    string ConcurrencyToken,
    IReadOnlyList<InvoiceItemResponse> Items)
{
    public static InvoiceResponse From(Invoice invoice) =>
        new(
            invoice.Id,
            invoice.InvoiceNumber,
            invoice.CustomerId,
            invoice.IssueDate,
            invoice.DueDate,
            invoice.Status,
            invoice.Currency,
            invoice.Subtotal,
            invoice.TaxTotal,
            invoice.GrandTotal,
            invoice.CreatedAt,
            invoice.UpdatedAt,
            InvoiceConcurrencyToken.Encode(invoice.Version),
            invoice.Items
                .OrderBy(item => item.Id)
                .Select(InvoiceItemResponseMapper.From)
                .ToList());
}

public sealed record InvoiceSummaryResponse(
    Guid Id,
    string InvoiceNumber,
    Guid CustomerId,
    DateOnly IssueDate,
    DateOnly DueDate,
    InvoiceStatus Status,
    string Currency,
    decimal Subtotal,
    decimal TaxTotal,
    decimal GrandTotal,
    DateTime CreatedAt,
    DateTime? UpdatedAt,
    string ConcurrencyToken);

public sealed record InvoicePagedResponse<T>(
    IReadOnlyList<T> Items,
    int PageNumber,
    int PageSize,
    int TotalCount,
    int TotalPages);

internal static class InvoiceItemResponseMapper
{
    public static InvoiceItemResponse From(InvoiceItem item) =>
        new(
            item.Id,
            item.Description,
            item.Quantity,
            item.UnitPrice,
            item.TaxRate,
            item.LineSubtotal,
            item.LineTax,
            item.LineTotal);
}
