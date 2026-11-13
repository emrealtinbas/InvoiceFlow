using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Invoices;
using InvoiceFlow.IntegrationTests.Persistence;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class InvoiceReadTests(PostgresContainerFixture fixture) : InvoiceTestBase(fixture)
{
    [Fact]
    public async Task GetById_EnforcesOwnershipAndAllowsAdmin()
    {
        var (owner, ownerToken) = await CreateUserWithTokenAsync("invoice-read-owner@example.com");
        var (_, otherToken) = await CreateUserWithTokenAsync("invoice-read-other@example.com");
        var (_, adminToken) = await CreateUserWithTokenAsync("invoice-read-admin@example.com", AuthRoles.Admin);
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Read Customer", email: null);
        var created = await CreateInvoiceAsync(ownerToken, customer.Id);

        using var ownerResponse = await SendWithTokenAsync(
            HttpMethod.Get,
            $"/api/invoices/{created.Id}",
            ownerToken);
        using var otherResponse = await SendWithTokenAsync(
            HttpMethod.Get,
            $"/api/invoices/{created.Id}",
            otherToken);
        using var adminResponse = await SendWithTokenAsync(
            HttpMethod.Get,
            $"/api/invoices/{created.Id}",
            adminToken);

        Assert.Equal(HttpStatusCode.OK, ownerResponse.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, otherResponse.StatusCode);
        Assert.Equal(HttpStatusCode.OK, adminResponse.StatusCode);

        var payload = await ownerResponse.Content.ReadFromJsonAsync<InvoiceResponse>();
        Assert.NotNull(payload);
        Assert.Single(payload.Items);
        Assert.Equal(719.96m, payload.Items[0].LineTotal);
    }

    [Fact]
    public async Task GetById_DoesNotExposeOwnerOrDatabaseVersion()
    {
        var (owner, token) = await CreateUserWithTokenAsync("invoice-fields@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Fields", email: null);
        var invoice = await CreateInvoiceAsync(token, customer.Id);

        using var response = await SendWithTokenAsync(HttpMethod.Get, $"/api/invoices/{invoice.Id}", token);
        var json = await response.Content.ReadAsStringAsync();

        Assert.DoesNotContain("ownerId", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("\"version\"", json, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("concurrencyToken", json, StringComparison.Ordinal);
    }
}
