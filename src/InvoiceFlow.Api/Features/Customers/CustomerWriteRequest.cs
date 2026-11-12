using System.ComponentModel.DataAnnotations;

namespace InvoiceFlow.Api.Features.Customers;

/// <summary>
/// Fields shared by the customer create and update requests. Optional text fields are
/// trimmed and blank values are normalized to <c>null</c> before validation.
/// </summary>
public abstract class CustomerWriteRequest
{
    private string _name = string.Empty;
    private string? _email;
    private string? _phone;
    private string? _address;
    private string? _taxNumber;

    [Required]
    [NotEmptyOrWhitespace]
    [StringLength(200, MinimumLength = 2)]
    public string Name
    {
        get => _name;
        set => _name = value?.Trim() ?? string.Empty;
    }

    [EmailAddress]
    [StringLength(254)]
    public string? Email
    {
        get => _email;
        set => _email = NormalizeOptional(value);
    }

    [StringLength(30)]
    [RegularExpression(
        "^[0-9 +()\\-]*$",
        ErrorMessage = "The {0} field may contain only digits, spaces, '+', '-', and parentheses.")]
    public string? Phone
    {
        get => _phone;
        set => _phone = NormalizeOptional(value);
    }

    [StringLength(500)]
    public string? Address
    {
        get => _address;
        set => _address = NormalizeOptional(value);
    }

    [RegularExpression(
        "^[0-9]{10}([0-9])?$",
        ErrorMessage = "The {0} field must contain 10 or 11 digits.")]
    public string? TaxNumber
    {
        get => _taxNumber;
        set => _taxNumber = NormalizeOptional(value);
    }

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
