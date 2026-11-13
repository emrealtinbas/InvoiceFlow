using System.Net;

namespace InvoiceFlow.IntegrationTests;

public sealed class CorsTests : IDisposable
{
    private const string AllowedOrigin = "https://allowed.example";

    private readonly InvoiceFlowApiFactory _factory;
    private readonly HttpClient _client;

    public CorsTests()
    {
        _factory = new InvoiceFlowApiFactory(
            configuration: new Dictionary<string, string?>
            {
                ["Cors:AllowedOrigins:0"] = AllowedOrigin,
            });

        _client = _factory.CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Fact]
    public async Task AllowedOrigin_ReceivesCorsHeadersWithoutCredentials()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health/live");
        request.Headers.Add("Origin", AllowedOrigin);

        using var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(
            AllowedOrigin,
            Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
        Assert.False(response.Headers.Contains("Access-Control-Allow-Credentials"));
    }

    [Fact]
    public async Task DisallowedOrigin_DoesNotReceiveCorsHeaders()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health/live");
        request.Headers.Add("Origin", "https://disallowed.example");

        using var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task PreflightFromAllowedOrigin_ReturnsTheConfiguredPolicy()
    {
        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/auth/login");
        request.Headers.Add("Origin", AllowedOrigin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "content-type");

        using var response = await _client.SendAsync(request);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(
            AllowedOrigin,
            Assert.Single(response.Headers.GetValues("Access-Control-Allow-Origin")));
        Assert.Contains(
            "POST",
            Assert.Single(response.Headers.GetValues("Access-Control-Allow-Methods")),
            StringComparison.Ordinal);
        Assert.False(response.Headers.Contains("Access-Control-Allow-Credentials"));
    }

    [Fact]
    public async Task NoConfiguredOrigins_AllowsNoCrossOriginAccess()
    {
        using var factory = new InvoiceFlowApiFactory();
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/health/live");
        request.Headers.Add("Origin", AllowedOrigin);

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }
}
