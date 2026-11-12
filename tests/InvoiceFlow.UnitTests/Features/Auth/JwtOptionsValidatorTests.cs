using InvoiceFlow.Api.Features.Auth;

namespace InvoiceFlow.UnitTests.Features.Auth;

public sealed class JwtOptionsValidatorTests
{
    private readonly JwtOptionsValidator _validator = new();

    [Fact]
    public void Validate_WithValidOptions_Succeeds()
    {
        var result = _validator.Validate(null, CreateValidOptions());

        Assert.True(result.Succeeded);
    }

    [Fact]
    public void Validate_WithoutIssuer_Fails()
    {
        var options = CreateValidOptions();
        options.Issuer = string.Empty;

        var result = _validator.Validate(null, options);

        Assert.False(result.Succeeded);
        Assert.Contains(result.Failures!, failure => failure.Contains("Issuer", StringComparison.Ordinal));
    }

    [Fact]
    public void Validate_WithoutAudience_Fails()
    {
        var options = CreateValidOptions();
        options.Audience = string.Empty;

        var result = _validator.Validate(null, options);

        Assert.False(result.Succeeded);
        Assert.Contains(result.Failures!, failure => failure.Contains("Audience", StringComparison.Ordinal));
    }

    [Fact]
    public void Validate_WithoutSigningKey_Fails()
    {
        var options = CreateValidOptions();
        options.SigningKey = string.Empty;

        var result = _validator.Validate(null, options);

        Assert.False(result.Succeeded);
        Assert.Contains(result.Failures!, failure => failure.Contains("SigningKey", StringComparison.Ordinal));
    }

    [Fact]
    public void Validate_WithShortSigningKey_Fails()
    {
        var options = CreateValidOptions();
        options.SigningKey = "too-short";

        var result = _validator.Validate(null, options);

        Assert.False(result.Succeeded);
        Assert.Contains(result.Failures!, failure => failure.Contains("at least", StringComparison.Ordinal));
    }

    [Fact]
    public void Validate_WithNonPositiveLifetime_Fails()
    {
        var options = CreateValidOptions();
        options.AccessTokenMinutes = 0;

        var result = _validator.Validate(null, options);

        Assert.False(result.Succeeded);
        Assert.Contains(
            result.Failures!,
            failure => failure.Contains("AccessTokenMinutes", StringComparison.Ordinal));
    }

    [Fact]
    public void Validate_DoesNotEchoTheSigningKeyInFailureMessages()
    {
        const string key = "secret-key-that-is-too-short";
        var options = CreateValidOptions();
        options.SigningKey = key;

        var result = _validator.Validate(null, options);

        Assert.False(result.Succeeded);
        Assert.DoesNotContain(result.Failures!, failure => failure.Contains(key, StringComparison.Ordinal));
    }

    private static JwtOptions CreateValidOptions() => new()
    {
        Issuer = "InvoiceFlow",
        Audience = "InvoiceFlow.Api",
        AccessTokenMinutes = 30,
        SigningKey = new string('k', JwtOptions.MinimumSigningKeyBytes),
    };
}
