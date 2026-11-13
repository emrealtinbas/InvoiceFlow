using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Invoices;
using InvoiceFlow.IntegrationTests.Persistence;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class InvoiceUpdateTests(PostgresContainerFixture fixture) : InvoiceTestBase(fixture)
{
    [Fact]
    public async Task Update_Draft_RecalculatesAndReplacesItemsWithoutChangingImmutableFields()
    {
        var (owner, token) = await CreateUserWithTokenAsync("invoice-update@example.com");
        var firstCustomer = await CreateCustomerDirectlyAsync(owner.Id, "Update A", email: null);
        var secondCustomer = await CreateCustomerDirectlyAsync(owner.Id, "Update B", email: null);
        var created = await CreateInvoiceAsync(token, firstCustomer.Id);
        var originalItemId = Assert.Single(created.Items).Id;

        using var response = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/invoices/{created.Id}",
            token,
            new
            {
                customerId = secondCustomer.Id,
                issueDate = IssueDate.AddDays(1),
                dueDate = DueDate.AddDays(1),
                concurrencyToken = created.ConcurrencyToken,
                ownerId = Guid.NewGuid(),
                invoiceNumber = "CHANGED",
                status = "Paid",
                createdAt = DateTime.UnixEpoch,
                items = new[]
                {
                    new { description = "First replacement", quantity = 2m, unitPrice = 100m, taxRate = 10m },
                    new { description = "Second replacement", quantity = 1m, unitPrice = 50m, taxRate = 0m },
                },
            });

        Assert.True(
            response.StatusCode == HttpStatusCode.OK,
            await response.Content.ReadAsStringAsync());
        var payload = await response.Content.ReadFromJsonAsync<InvoiceResponse>();
        Assert.NotNull(payload);
        Assert.Equal(created.InvoiceNumber, payload.InvoiceNumber);
        Assert.Equal(created.CreatedAt, payload.CreatedAt);
        Assert.Equal(InvoiceStatus.Draft, payload.Status);
        Assert.Equal(secondCustomer.Id, payload.CustomerId);
        Assert.Equal(250m, payload.Subtotal);
        Assert.Equal(20m, payload.TaxTotal);
        Assert.Equal(270m, payload.GrandTotal);
        Assert.NotEqual(created.ConcurrencyToken, payload.ConcurrencyToken);
        Assert.DoesNotContain(payload.Items, item => item.Id == originalItemId);

        var stored = await FindInvoiceAsync(created.Id);
        Assert.NotNull(stored);
        Assert.Equal(owner.Id, stored.OwnerId);
        Assert.Equal(2, stored.Items.Count);
    }

    [Fact]
    public async Task Update_AdminCanUpdateButCannotTransferOwnership()
    {
        var (owner, ownerToken) = await CreateUserWithTokenAsync("invoice-update-owner@example.com");
        var (other, _) = await CreateUserWithTokenAsync("invoice-update-other@example.com");
        var (_, adminToken) = await CreateUserWithTokenAsync("invoice-update-admin@example.com", AuthRoles.Admin);
        var ownerCustomer = await CreateCustomerDirectlyAsync(owner.Id, "Owner Customer", email: null);
        var otherCustomer = await CreateCustomerDirectlyAsync(other.Id, "Other Customer", email: null);
        var created = await CreateInvoiceAsync(ownerToken, ownerCustomer.Id);

        using var valid = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/invoices/{created.Id}",
            adminToken,
            ValidUpdateBody(ownerCustomer.Id, created.ConcurrencyToken));
        Assert.True(
            valid.StatusCode == HttpStatusCode.OK,
            await valid.Content.ReadAsStringAsync());
        var updated = await valid.Content.ReadFromJsonAsync<InvoiceResponse>();
        Assert.NotNull(updated);

        using var transfer = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/invoices/{created.Id}",
            adminToken,
            ValidUpdateBody(otherCustomer.Id, updated.ConcurrencyToken));
        Assert.Equal(HttpStatusCode.NotFound, transfer.StatusCode);
    }

    [Fact]
    public async Task Update_NonDraft_ReturnsConflict()
    {
        var (owner, token) = await CreateUserWithTokenAsync("invoice-update-state@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "State", email: null);
        var created = await CreateInvoiceAsync(token, customer.Id);
        await SetInvoiceStatusAsync(created.Id, InvoiceStatus.Sent);

        using var response = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/invoices/{created.Id}",
            token,
            ValidUpdateBody(customer.Id, created.ConcurrencyToken));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Update_StaleToken_ReturnsConflictAndRollsBackItemReplacement()
    {
        var (owner, token) = await CreateUserWithTokenAsync("invoice-update-stale@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Stale", email: null);
        var created = await CreateInvoiceAsync(token, customer.Id);
        var originalItemId = Assert.Single(created.Items).Id;
        await TouchInvoiceAsync(created.Id);

        using var response = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/invoices/{created.Id}",
            token,
            ValidUpdateBody(customer.Id, created.ConcurrencyToken));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var stored = await FindInvoiceAsync(created.Id);
        Assert.NotNull(stored);
        Assert.Contains(stored.Items, item => item.Id == originalItemId);
    }

    [Fact]
    public async Task Update_OtherUserReceivesNotFound()
    {
        var (owner, ownerToken) = await CreateUserWithTokenAsync("invoice-update-private-a@example.com");
        var (_, otherToken) = await CreateUserWithTokenAsync("invoice-update-private-b@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Private Update", email: null);
        var created = await CreateInvoiceAsync(ownerToken, customer.Id);

        using var response = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/invoices/{created.Id}",
            otherToken,
            ValidUpdateBody(customer.Id, created.ConcurrencyToken));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
