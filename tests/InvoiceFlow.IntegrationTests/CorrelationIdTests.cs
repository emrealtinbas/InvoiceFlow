using System.Net;
using System.Text.Json;
using InvoiceFlow.Api.Infrastructure.Observability;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class CorrelationIdTests(PostgresContainerFixture fixture) : AuthTestBase(fixture)
{
    private const string HeaderName = "X-Correlation-ID";

    [Fact]
    public async Task MissingCorrelationId_IsGeneratedAndEchoed()
    {
        using var response = await Client.GetAsync("/health/live");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var correlationId = Assert.Single(response.Headers.GetValues(HeaderName));

        Assert.True(CorrelationIdMiddleware.IsValid(correlationId));
    }

    [Fact]
    public async Task ValidCorrelationId_IsPreserved()
    {
        const string correlationId = "client-request-123";

        using var response = await SendWithCorrelationIdAsync("/health/live", correlationId);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(correlationId, Assert.Single(response.Headers.GetValues(HeaderName)));
    }

    [Theory]
    [InlineData("invalid value")]
    [InlineData("invalid\tvalue")]
    [InlineData("invalid/value")]
    public async Task InvalidCorrelationId_IsReplaced(string invalidCorrelationId)
    {
        using var response = await SendWithCorrelationIdAsync("/health/live", invalidCorrelationId);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var correlationId = Assert.Single(response.Headers.GetValues(HeaderName));

        Assert.NotEqual(invalidCorrelationId, correlationId);
        Assert.True(CorrelationIdMiddleware.IsValid(correlationId));
    }

    [Fact]
    public async Task OverlongCorrelationId_IsReplaced()
    {
        var overlong = new string('a', CorrelationIdMiddleware.MaximumLength + 1);

        using var response = await SendWithCorrelationIdAsync("/health/live", overlong);

        var correlationId = Assert.Single(response.Headers.GetValues(HeaderName));

        Assert.NotEqual(overlong, correlationId);
        Assert.True(CorrelationIdMiddleware.IsValid(correlationId));
    }

    [Fact]
    public async Task CorrelationId_IsIncludedInErrorDiagnostics()
    {
        const string correlationId = "diagnostic-request-42";

        using var response = await SendWithCorrelationIdAsync("/api/auth/me", correlationId);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(correlationId, Assert.Single(response.Headers.GetValues(HeaderName)));

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(correlationId, document.RootElement.GetProperty("traceId").GetString());
        Assert.Equal(correlationId, document.RootElement.GetProperty("correlationId").GetString());
    }

    [Fact]
    public async Task CorrelationId_IsIncludedInLoggingScope()
    {
        const string correlationId = "logging-request-7";
        var provider = new CapturingLoggerProvider();

        Factory.Services.GetRequiredService<ILoggerFactory>().AddProvider(provider);

        using var response = await SendWithCorrelationIdAsync("/api/auth/me", correlationId);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains(
            provider.Scopes,
            scope => scope.TryGetValue("CorrelationId", out var value) &&
                Equals(value, correlationId));
        Assert.Contains(
            provider.Messages,
            message => message.Contains(correlationId, StringComparison.Ordinal));
    }

    private async Task<HttpResponseMessage> SendWithCorrelationIdAsync(
        string path,
        string correlationId)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add(HeaderName, correlationId);

        return await Client.SendAsync(request);
    }
}
