using System.Net;
using System.Text.Json;

namespace InvoiceFlow.IntegrationTests;

public sealed class OpenApiTests : IDisposable
{
    private readonly InvoiceFlowApiFactory _factory = new();
    private readonly HttpClient _client;

    public OpenApiTests()
    {
        _client = _factory.CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Fact]
    public async Task GetOpenApiDocument_DescribesHealthEndpoint()
    {
        using var response = await _client.GetAsync("/openapi/v1.json");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var paths = document.RootElement.GetProperty("paths");

        Assert.True(paths.TryGetProperty("/health", out _));
        Assert.True(paths.TryGetProperty("/health/live", out _));
    }

    [Fact]
    public async Task GetSwaggerUi_ReturnsHtml()
    {
        using var response = await _client.GetAsync("/swagger/index.html");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task GetOpenApiDocument_DocumentsBearerAuthenticationAndAuthEndpoints()
    {
        using var response = await _client.GetAsync("/openapi/v1.json");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;

        var scheme = root.GetProperty("components").GetProperty("securitySchemes").GetProperty("Bearer");

        Assert.Equal("http", scheme.GetProperty("type").GetString());
        Assert.Equal("bearer", scheme.GetProperty("scheme").GetString());
        Assert.Equal("JWT", scheme.GetProperty("bearerFormat").GetString());

        var security = root.GetProperty("security");

        Assert.Contains(security.EnumerateArray(), item => item.TryGetProperty("Bearer", out _));

        var paths = root.GetProperty("paths");
        var register = paths.GetProperty("/api/auth/register").GetProperty("post");
        var login = paths.GetProperty("/api/auth/login").GetProperty("post");
        var me = paths.GetProperty("/api/auth/me").GetProperty("get");

        // Registration and login are explicitly anonymous; /me inherits document security.
        Assert.Empty(register.GetProperty("security").EnumerateArray());
        Assert.Empty(login.GetProperty("security").EnumerateArray());
        Assert.False(me.TryGetProperty("security", out _));

        Assert.True(register.GetProperty("responses").TryGetProperty("201", out _));
        Assert.True(register.GetProperty("responses").TryGetProperty("400", out _));
        Assert.True(register.GetProperty("responses").TryGetProperty("409", out _));
        Assert.True(login.GetProperty("responses").TryGetProperty("200", out _));
        Assert.True(login.GetProperty("responses").TryGetProperty("401", out _));
        Assert.True(me.GetProperty("responses").TryGetProperty("200", out _));
        Assert.True(me.GetProperty("responses").TryGetProperty("401", out _));
    }

    [Fact]
    public async Task GetOpenApiDocument_DocumentsInvoiceCrudFiltersAndConcurrency()
    {
        using var response = await _client.GetAsync("/openapi/v1.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var paths = document.RootElement.GetProperty("paths");
        var collection = paths.GetProperty("/api/invoices");
        var resource = paths.GetProperty("/api/invoices/{id}");

        Assert.True(collection.TryGetProperty("post", out var create));
        Assert.True(collection.TryGetProperty("get", out var list));
        Assert.True(resource.TryGetProperty("get", out _));
        Assert.True(resource.TryGetProperty("put", out var update));
        Assert.True(resource.TryGetProperty("delete", out var delete));

        var listParameters = list.GetProperty("parameters")
            .EnumerateArray()
            .Select(parameter => parameter.GetProperty("name").GetString())
            .ToArray();

        Assert.Contains("pageNumber", listParameters);
        Assert.Contains("pageSize", listParameters);
        Assert.Contains("customerId", listParameters);
        Assert.Contains("status", listParameters);
        Assert.Contains("issueDateFrom", listParameters);
        Assert.Contains("issueDateTo", listParameters);
        Assert.Contains("search", listParameters);
        Assert.Contains("sortBy", listParameters);
        Assert.Contains("sortDirection", listParameters);

        Assert.True(create.GetProperty("responses").TryGetProperty("201", out _));
        Assert.True(update.GetProperty("responses").TryGetProperty("409", out _));
        Assert.Contains(
            delete.GetProperty("parameters").EnumerateArray(),
            parameter => parameter.GetProperty("name").GetString() == "concurrencyToken");
    }

    [Fact]
    public async Task GetOpenApiDocument_DocumentsInvoiceLifecycleEndpoints()
    {
        using var response = await _client.GetAsync("/openapi/v1.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var paths = document.RootElement.GetProperty("paths");
        var lifecyclePaths = new[]
        {
            "/api/invoices/{id}/send",
            "/api/invoices/{id}/mark-paid",
            "/api/invoices/{id}/cancel",
        };

        foreach (var path in lifecyclePaths)
        {
            var operation = paths.GetProperty(path).GetProperty("post");

            Assert.True(operation.TryGetProperty("requestBody", out var requestBody));
            Assert.True(requestBody.GetProperty("required").GetBoolean());
            Assert.True(operation.GetProperty("responses").TryGetProperty("200", out _));
            Assert.True(operation.GetProperty("responses").TryGetProperty("400", out _));
            Assert.True(operation.GetProperty("responses").TryGetProperty("401", out _));
            Assert.True(operation.GetProperty("responses").TryGetProperty("404", out _));
            Assert.True(operation.GetProperty("responses").TryGetProperty("409", out _));
        }
    }
}
