using System.Net;
using System.Net.Http.Json;

namespace InvoiceFlow.IntegrationTests;

public sealed class HealthEndpointUnavailableTests : IDisposable
{
    private const string UnavailableConnectionString =
        "Host=127.0.0.1;Port=1;Database=invoiceflow;Username=none;Password=none;Timeout=2";

    private readonly InvoiceFlowApiFactory _factory = new(UnavailableConnectionString);
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

    private sealed record HealthResponse(string Status);
}
