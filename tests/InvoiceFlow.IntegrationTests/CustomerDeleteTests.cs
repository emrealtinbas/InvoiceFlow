using System.Net;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.IntegrationTests.Persistence;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class CustomerDeleteTests(PostgresContainerFixture fixture) : CustomerTestBase(fixture)
{
    [Fact]
    public async Task Delete_AsOwner_RemovesCustomer()
    {
        var (_, token) = await CreateUserWithTokenAsync("delete-owner@example.com");
        var created = await CreateCustomerAsync(token, name: "Deletable Customer");

        using var response = await SendWithTokenAsync(
            HttpMethod.Delete,
            $"/api/customers/{created.Id}",
            token);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Null(await FindCustomerAsync(created.Id));

        using var get = await SendWithTokenAsync(
            HttpMethod.Get,
            $"/api/customers/{created.Id}",
            token);

        Assert.Equal(HttpStatusCode.NotFound, get.StatusCode);
    }

    [Fact]
    public async Task Delete_ForAnotherUsersCustomer_ReturnsNotFoundAndKeepsCustomer()
    {
        var (_, ownerToken) = await CreateUserWithTokenAsync("delete-owner-a@example.com");
        var (_, otherToken) = await CreateUserWithTokenAsync("delete-owner-b@example.com");
        var created = await CreateCustomerAsync(ownerToken, name: "Protected From Delete");

        using var response = await SendWithTokenAsync(
            HttpMethod.Delete,
            $"/api/customers/{created.Id}",
            otherToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.NotNull(await FindCustomerAsync(created.Id));
    }

    [Fact]
    public async Task Delete_AsAdmin_CanDeleteAnyCustomer()
    {
        var (_, ownerToken) = await CreateUserWithTokenAsync("admin-delete-owner@example.com");
        var (_, adminToken) = await CreateUserWithTokenAsync("admin-deleter@example.com", AuthRoles.Admin);
        var created = await CreateCustomerAsync(ownerToken, name: "Admin Deletable");

        using var response = await SendWithTokenAsync(
            HttpMethod.Delete,
            $"/api/customers/{created.Id}",
            adminToken);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Null(await FindCustomerAsync(created.Id));
    }

    [Fact]
    public async Task Delete_CustomerWithInvoices_ReturnsConflict()
    {
        var (owner, token) = await CreateUserWithTokenAsync("delete-with-invoice@example.com");
        var created = await CreateCustomerAsync(token, name: "Customer With Invoice");
        await CreateInvoiceDirectlyAsync(owner.Id, created.Id);

        using var response = await SendWithTokenAsync(
            HttpMethod.Delete,
            $"/api/customers/{created.Id}",
            token);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        var problem = await ReadProblemAsync(response);

        Assert.Equal((int)HttpStatusCode.Conflict, problem.Status);
        Assert.NotNull(await FindCustomerAsync(created.Id));
        Assert.Equal(1, await CountInvoicesAsync(created.Id));
    }

    [Fact]
    public async Task Delete_CustomerWithInvoices_LeavesFinancialRecordsIntact()
    {
        var (owner, token) = await CreateUserWithTokenAsync("delete-financial@example.com");
        var created = await CreateCustomerAsync(token, name: "Financial Customer");
        var invoice = await CreateInvoiceDirectlyAsync(owner.Id, created.Id, withItem: true);

        using var response = await SendWithTokenAsync(
            HttpMethod.Delete,
            $"/api/customers/{created.Id}",
            token);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(1, await CountInvoicesAsync(created.Id));
        Assert.Equal(1, await CountInvoiceItemsAsync(invoice.Id));
    }

    [Fact]
    public async Task Delete_NonexistentCustomer_ReturnsNotFound()
    {
        var (_, token) = await CreateUserWithTokenAsync("delete-missing@example.com");

        using var response = await SendWithTokenAsync(
            HttpMethod.Delete,
            $"/api/customers/{Guid.NewGuid()}",
            token);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
