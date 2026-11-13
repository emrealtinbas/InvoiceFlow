using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.IntegrationTests.Persistence;

namespace InvoiceFlow.IntegrationTests;

public sealed class HealthEndpointUnavailableTests : IDisposable
{
    private readonly InvoiceFlowApiFactory _factory =
        new(TestDatabase.UnavailableConnectionString);
    private readonly HttpClient _client;

    public HealthEndpointUnavailableTests()
    {
        _client = _factory.CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Fact]
    public async Task GetHealth_ReturnsServiceUnavailableWhenDatabaseIsDown()
    {
        using var response = await _client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<HealthResponse>();

        Assert.NotNull(payload);
        Assert.Equal("Unhealthy", payload.Status);
    }

    [Fact]
    public async Task GetHealthLive_ReturnsOkWhenDatabaseIsDown()
    {
        using var response = await _client.GetAsync("/health/live");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<HealthResponse>();

        Assert.NotNull(payload);
        Assert.Equal("Healthy", payload.Status);
    }

    private sealed record HealthResponse(string Status);
}
