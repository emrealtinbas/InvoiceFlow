using InvoiceFlow.Api.Infrastructure.Observability;
using Microsoft.Extensions.Primitives;

namespace InvoiceFlow.UnitTests.Infrastructure;

public sealed class CorrelationIdMiddlewareTests
{
    [Theory]
    [InlineData("3f0c72bcc8104dbaa7319f1e2d3c4b5a")]
    [InlineData("client-request-123")]
    [InlineData("trace:abc.def_123")]
    public void IsValid_AcceptsSafeTokens(string value)
    {
        Assert.True(CorrelationIdMiddleware.IsValid(value));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("contains space")]
    [InlineData("contains\tcontrol")]
    [InlineData("contains\ncontrol")]
    [InlineData("contains/slash")]
    public void IsValid_RejectsUnsafeTokens(string? value)
    {
        Assert.False(CorrelationIdMiddleware.IsValid(value));
    }

    [Fact]
    public void IsValid_RejectsValuesLongerThanTheLimit()
    {
        Assert.False(CorrelationIdMiddleware.IsValid(new string('a', CorrelationIdMiddleware.MaximumLength + 1)));
        Assert.True(CorrelationIdMiddleware.IsValid(new string('a', CorrelationIdMiddleware.MaximumLength)));
    }

    [Fact]
    public void Resolve_PreservesAValidClientValue()
    {
        var resolved = CorrelationIdMiddleware.Resolve(new StringValues("client-request-123"));

        Assert.Equal("client-request-123", resolved);
    }

    [Fact]
    public void Resolve_GeneratesAnIdentifierWhenTheHeaderIsMissingOrInvalid()
    {
        var missing = CorrelationIdMiddleware.Resolve(StringValues.Empty);
        var invalid = CorrelationIdMiddleware.Resolve(new StringValues("invalid value"));

        Assert.NotEqual(missing, invalid);
        Assert.True(CorrelationIdMiddleware.IsValid(missing));
        Assert.True(CorrelationIdMiddleware.IsValid(invalid));
    }

    [Fact]
    public void Resolve_GeneratesAnIdentifierWhenMultipleValuesAreSupplied()
    {
        var resolved = CorrelationIdMiddleware.Resolve(new StringValues(["first", "second"]));

        Assert.True(CorrelationIdMiddleware.IsValid(resolved));
        Assert.DoesNotContain("first", resolved, StringComparison.Ordinal);
    }
}
