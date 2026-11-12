using System.Text;
using Microsoft.Extensions.Options;

namespace InvoiceFlow.Api.Features.Auth;

/// <summary>
/// Strongly typed JWT configuration. The signing key is never stored in committed
/// configuration files; it is supplied through <c>Jwt__SigningKey</c>.
/// </summary>
public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    /// <summary>Minimum HS256 key size in bytes (256 bits).</summary>
    public const int MinimumSigningKeyBytes = 32;

    public string Issuer { get; set; } = string.Empty;

    public string Audience { get; set; } = string.Empty;

    public int AccessTokenMinutes { get; set; } = 30;

    public string SigningKey { get; set; } = string.Empty;
}

/// <summary>
/// Validates <see cref="JwtOptions"/> at startup and whenever the options are resolved.
/// Error messages never include the configured key value.
/// </summary>
public sealed class JwtOptionsValidator : IValidateOptions<JwtOptions>
{
    public ValidateOptionsResult Validate(string? name, JwtOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        var failures = new List<string>();

        if (string.IsNullOrWhiteSpace(options.Issuer))
        {
            failures.Add("Jwt:Issuer is required.");
        }

        if (string.IsNullOrWhiteSpace(options.Audience))
        {
            failures.Add("Jwt:Audience is required.");
        }

        if (options.AccessTokenMinutes <= 0)
        {
            failures.Add("Jwt:AccessTokenMinutes must be greater than zero.");
        }

        if (string.IsNullOrWhiteSpace(options.SigningKey))
        {
            failures.Add(
                "Jwt:SigningKey is required. Provide a random key of at least " +
                $"{JwtOptions.MinimumSigningKeyBytes} bytes through the Jwt__SigningKey environment variable.");
        }
        else if (Encoding.UTF8.GetByteCount(options.SigningKey) < JwtOptions.MinimumSigningKeyBytes)
        {
            failures.Add(
                $"Jwt:SigningKey must be at least {JwtOptions.MinimumSigningKeyBytes} bytes long.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }
}
