using System.ComponentModel.DataAnnotations;

namespace InvoiceFlow.Api.Features.Customers;

/// <summary>
/// Rejects null, empty, and whitespace-only string values. <see cref="RequiredAttribute"/>
/// accepts whitespace, so this complements it for names.
/// </summary>
[AttributeUsage(
    AttributeTargets.Property | AttributeTargets.Field | AttributeTargets.Parameter,
    AllowMultiple = false)]
public sealed class NotEmptyOrWhitespaceAttribute : ValidationAttribute
{
    public NotEmptyOrWhitespaceAttribute()
        : base("The {0} field must not be empty or whitespace.")
    {
    }

    public override bool IsValid(object? value) =>
        value is string text && !string.IsNullOrWhiteSpace(text);
}

/// <summary>
/// Canonical e-mail handling for customers. Surrounding whitespace is removed and the
/// value is stored lowercase so per-owner uniqueness is consistent.
/// </summary>
internal static class CustomerEmail
{
    public static string? Normalize(string? email) =>
        string.IsNullOrWhiteSpace(email) ? null : email.Trim().ToLowerInvariant();
}
