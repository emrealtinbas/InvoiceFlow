using System.ComponentModel.DataAnnotations;

namespace InvoiceFlow.Api.Features.Invoices;

/// <summary>
/// Lifecycle command body. Use the opaque concurrency token from the latest invoice response.
/// </summary>
public sealed class InvoiceLifecycleRequest : IValidatableObject
{
    [Required]
    public string ConcurrencyToken { get; set; } = string.Empty;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (!InvoiceConcurrencyToken.TryDecode(ConcurrencyToken, out _))
        {
            yield return new ValidationResult(
                "ConcurrencyToken is invalid.",
                [nameof(ConcurrencyToken)]);
        }
    }
}
