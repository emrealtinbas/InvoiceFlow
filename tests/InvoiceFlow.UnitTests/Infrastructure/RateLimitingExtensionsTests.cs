using System.Net;
using InvoiceFlow.Api.Infrastructure.RateLimiting;
using Microsoft.AspNetCore.Http;

namespace InvoiceFlow.UnitTests.Infrastructure;

public sealed class RateLimitingExtensionsTests
{
    [Fact]
    public void ResolvePartitionKey_UsesTheConnectionAddress()
    {
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = IPAddress.Parse("203.0.113.10");

        Assert.Equal("203.0.113.10", RateLimitingExtensions.ResolvePartitionKey(context));
    }

    [Fact]
    public void ResolvePartitionKey_UsesASafeFallbackWhenTheAddressIsUnavailable()
    {
        var context = new DefaultHttpContext();
        context.Connection.RemoteIpAddress = null;

        Assert.Equal("unknown-client", RateLimitingExtensions.ResolvePartitionKey(context));
    }
}
