using System.ComponentModel.DataAnnotations;

namespace InvoiceFlow.Api.Features.Invoices;

/// <summary>One client-supplied invoice line. Calculated amounts are never accepted.</summary>
public sealed class InvoiceItemRequest : IValidatableObject
{
    private string _description = string.Empty;

    [Required]
    [StringLength(500)]
    public string Description
    {
        get => _description;
        set => _description = value?.Trim() ?? string.Empty;
    }

    public decimal Quantity { get; set; }

    public decimal UnitPrice { get; set; }

    public decimal TaxRate { get; set; }

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (string.IsNullOrWhiteSpace(Description))
        {
            yield return new ValidationResult(
                "Description must not be empty or whitespace.",
                [nameof(Description)]);
        }

        if (Quantity <= 0m || Quantity > InvoiceFinancialLimits.MaximumQuantity)
        {
            yield return new ValidationResult(
                $"Quantity must be greater than zero and no greater than {InvoiceFinancialLimits.MaximumQuantity}.",
                [nameof(Quantity)]);
        }
        else if (!InvoiceDecimalValidation.HasAtMostScale(Quantity, 3))
        {
            yield return new ValidationResult(
                "Quantity must have at most 3 decimal places.",
                [nameof(Quantity)]);
        }

        if (UnitPrice < 0m || UnitPrice > InvoiceFinancialLimits.MaximumMoney)
        {
            yield return new ValidationResult(
                $"UnitPrice must be between zero and {InvoiceFinancialLimits.MaximumMoney}.",
                [nameof(UnitPrice)]);
        }
        else if (!InvoiceDecimalValidation.HasAtMostScale(UnitPrice, 2))
        {
            yield return new ValidationResult(
                "UnitPrice must have at most 2 decimal places.",
                [nameof(UnitPrice)]);
        }

        if (TaxRate < 0m || TaxRate > 100m)
        {
            yield return new ValidationResult(
                "TaxRate must be between 0 and 100.",
                [nameof(TaxRate)]);
        }
        else if (!InvoiceDecimalValidation.HasAtMostScale(TaxRate, 2))
        {
            yield return new ValidationResult(
                "TaxRate must have at most 2 decimal places.",
                [nameof(TaxRate)]);
        }
    }
}

/// <summary>Creates a Draft TRY invoice. IssueDate defaults to the current UTC date.</summary>
public sealed class CreateInvoiceRequest : IValidatableObject
{
    public Guid CustomerId { get; set; }

    public DateOnly? IssueDate { get; set; }

    public DateOnly DueDate { get; set; }

    [Required]
    [MinLength(1)]
    [MaxLength(100)]
    public List<InvoiceItemRequest> Items { get; set; } = [];

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (CustomerId == Guid.Empty)
        {
            yield return new ValidationResult("CustomerId is required.", [nameof(CustomerId)]);
        }

        if (DueDate == default)
        {
            yield return new ValidationResult("DueDate is required.", [nameof(DueDate)]);
        }

        if (IssueDate is not null && DueDate != default && DueDate < IssueDate)
        {
            yield return new ValidationResult(
                "DueDate must be on or after IssueDate.",
                [nameof(DueDate)]);
        }
    }
}

/// <summary>
/// Fully replaces the mutable fields of a Draft invoice. ConcurrencyToken must be the
/// opaque token returned by the most recent invoice response.
/// </summary>
public sealed class UpdateInvoiceRequest : IValidatableObject
{
    public Guid CustomerId { get; set; }

    public DateOnly IssueDate { get; set; }

    public DateOnly DueDate { get; set; }

    [Required]
    [MinLength(1)]
    [MaxLength(100)]
    public List<InvoiceItemRequest> Items { get; set; } = [];

    [Required]
    public string ConcurrencyToken { get; set; } = string.Empty;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (CustomerId == Guid.Empty)
        {
            yield return new ValidationResult("CustomerId is required.", [nameof(CustomerId)]);
        }

        if (IssueDate == default)
        {
            yield return new ValidationResult("IssueDate is required.", [nameof(IssueDate)]);
        }

        if (DueDate == default)
        {
            yield return new ValidationResult("DueDate is required.", [nameof(DueDate)]);
        }
        else if (IssueDate != default && DueDate < IssueDate)
        {
            yield return new ValidationResult(
                "DueDate must be on or after IssueDate.",
                [nameof(DueDate)]);
        }

        if (!InvoiceConcurrencyToken.TryDecode(ConcurrencyToken, out _))
        {
            yield return new ValidationResult(
                "ConcurrencyToken is invalid.",
                [nameof(ConcurrencyToken)]);
        }
    }
}

internal static class InvoiceDecimalValidation
{
    public static bool HasAtMostScale(decimal value, int scale) =>
        decimal.Round(value, scale) == value;
}
