using System.Net;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Invoices;
using InvoiceFlow.Api.Infrastructure.Persistence;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class InvoiceDeleteTests(PostgresContainerFixture fixture) : InvoiceTestBase(fixture)
{
    [Fact]
    public async Task Delete_Draft_RemovesItemsButKeepsCustomer()
    {
        var (owner, token) = await CreateUserWithTokenAsync("invoice-delete@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Delete Customer", email: null);
        var created = await CreateInvoiceAsync(token, customer.Id);

        using var response = await SendWithTokenAsync(
            HttpMethod.Delete,
            DeleteUrl(created.Id, created.ConcurrencyToken),
            token);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Null(await FindInvoiceAsync(created.Id));
        Assert.NotNull(await FindCustomerByIdAsync(customer.Id));

        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False(await dbContext.InvoiceItems.AnyAsync(item => item.InvoiceId == created.Id));
    }

    [Fact]
    public async Task Delete_NonDraft_ReturnsConflict()
    {
        var (owner, token) = await CreateUserWithTokenAsync("invoice-delete-state@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Delete State", email: null);
        var created = await CreateInvoiceAsync(token, customer.Id);
        await SetInvoiceStatusAsync(created.Id, InvoiceStatus.Paid);

        using var response = await SendWithTokenAsync(
            HttpMethod.Delete,
            DeleteUrl(created.Id, created.ConcurrencyToken),
            token);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.NotNull(await FindInvoiceAsync(created.Id));
    }

    [Fact]
    public async Task Delete_StaleToken_ReturnsConflict()
    {
        var (owner, token) = await CreateUserWithTokenAsync("invoice-delete-stale@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Delete Stale", email: null);
        var created = await CreateInvoiceAsync(token, customer.Id);
        await TouchInvoiceAsync(created.Id);

        using var response = await SendWithTokenAsync(
            HttpMethod.Delete,
            DeleteUrl(created.Id, created.ConcurrencyToken),
            token);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.NotNull(await FindInvoiceAsync(created.Id));
    }

    [Fact]
    public async Task Delete_OtherUserReceivesNotFound()
    {
        var (owner, ownerToken) = await CreateUserWithTokenAsync("invoice-delete-private-a@example.com");
        var (_, otherToken) = await CreateUserWithTokenAsync("invoice-delete-private-b@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Delete Private", email: null);
        var created = await CreateInvoiceAsync(ownerToken, customer.Id);

        using var response = await SendWithTokenAsync(
            HttpMethod.Delete,
            DeleteUrl(created.Id, created.ConcurrencyToken),
            otherToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.NotNull(await FindInvoiceAsync(created.Id));
    }

    [Fact]
    public async Task Delete_AdminCanDeleteAnyDraftInvoice()
    {
        var (owner, ownerToken) = await CreateUserWithTokenAsync("invoice-delete-admin-owner@example.com");
        var (_, adminToken) = await CreateUserWithTokenAsync("invoice-delete-admin@example.com", AuthRoles.Admin);
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Admin Delete", email: null);
        var created = await CreateInvoiceAsync(ownerToken, customer.Id);

        using var response = await SendWithTokenAsync(
            HttpMethod.Delete,
            DeleteUrl(created.Id, created.ConcurrencyToken),
            adminToken);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Null(await FindInvoiceAsync(created.Id));
        Assert.NotNull(await FindCustomerByIdAsync(customer.Id));
    }

    private static string DeleteUrl(Guid id, string token) =>
        $"/api/invoices/{id}?concurrencyToken={Uri.EscapeDataString(token)}";
}
