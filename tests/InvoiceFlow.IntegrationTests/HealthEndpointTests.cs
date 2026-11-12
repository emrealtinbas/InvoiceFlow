using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.IntegrationTests.Persistence;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class HealthEndpointTests : IDisposable
{
    private readonly InvoiceFlowApiFactory _factory;
    private readonly HttpClient _client;

    public HealthEndpointTests(PostgresContainerFixture fixture)
    {
        _factory = new InvoiceFlowApiFactory(fixture.ConnectionString);
        _client = _factory.CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Fact]
    public async Task GetHealth_ReturnsOkWithHealthyStatus()
    {
        using var response = await _client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);

        var payload = await response.Content.ReadFromJsonAsync<HealthResponse>();

        Assert.NotNull(payload);
        Assert.Equal("Healthy", payload.Status);
    }

    private sealed record HealthResponse(string Status);
}
