using System.Net;
using InvoiceFlow.IntegrationTests.Persistence;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class ErrorHandlingTests : IDisposable
{
    private readonly InvoiceFlowApiFactory _factory;
    private readonly HttpClient _client;

    public ErrorHandlingTests(PostgresContainerFixture fixture)
    {
        _factory = new InvoiceFlowApiFactory(fixture.ConnectionString, environment: "Production");
        _client = _factory.CreateClient();
    }

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    [Fact]
    public async Task UnhandledException_Returns500WithoutSensitiveDetails()
    {
        using var response = await _client.GetAsync("/api/test/authorization/throw");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();

        Assert.DoesNotContain("Sensitive server detail", body, StringComparison.Ordinal);
        Assert.DoesNotContain("InvalidOperationException", body, StringComparison.Ordinal);
        Assert.DoesNotContain("StackTrace", body, StringComparison.OrdinalIgnoreCase);
    }
}
