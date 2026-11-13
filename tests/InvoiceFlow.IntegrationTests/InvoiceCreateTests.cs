using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Invoices;
using InvoiceFlow.Api.Infrastructure.Persistence;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class InvoiceCreateTests(PostgresContainerFixture fixture) : InvoiceTestBase(fixture)
{
    [Fact]
    public async Task Create_ValidRequest_PersistsDraftWithServerControlledValues()
    {
        var (owner, token) = await CreateUserWithTokenAsync("invoice-create@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Invoice Customer", email: null);

        using var response = await SendJsonAsync(HttpMethod.Post, "/api/invoices", token, new
        {
            customerId = customer.Id,
            issueDate = IssueDate,
            dueDate = DueDate,
            ownerId = Guid.NewGuid(),
            invoiceNumber = "CLIENT-NUMBER",
            status = "Paid",
            currency = "USD",
            subtotal = 1,
            taxTotal = 1,
            grandTotal = 1,
            version = uint.MaxValue,
            items = new[]
            {
                new
                {
                    description = "  Backend API Development  ",
                    quantity = 3m,
                    unitPrice = 199.99m,
                    taxRate = 20m,
                    lineTotal = 1m,
                },
            },
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(response.Headers.Location);
        var payload = await response.Content.ReadFromJsonAsync<InvoiceResponse>();
        Assert.NotNull(payload);
        Assert.Matches("^INV-2026-[0-9]{6,}$", payload.InvoiceNumber);
        Assert.Equal(InvoiceStatus.Draft, payload.Status);
        Assert.Equal("TRY", payload.Currency);
        Assert.Equal(599.97m, payload.Subtotal);
        Assert.Equal(119.99m, payload.TaxTotal);
        Assert.Equal(719.96m, payload.GrandTotal);
        Assert.Equal("Backend API Development", Assert.Single(payload.Items).Description);
        Assert.False(string.IsNullOrWhiteSpace(payload.ConcurrencyToken));

        var stored = await FindInvoiceAsync(payload.Id);
        Assert.NotNull(stored);
        Assert.Equal(owner.Id, stored.OwnerId);
        Assert.Single(stored.Items);
        Assert.True(InvoiceConcurrencyToken.TryDecode(payload.ConcurrencyToken, out var responseVersion));
        Assert.Equal(stored.Version, responseVersion);
    }

    [Fact]
    public async Task Create_ConcurrentRequests_GenerateUniqueNumbers()
    {
        var (owner, token) = await CreateUserWithTokenAsync("invoice-concurrent@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Concurrent", email: null);

        var requests = Enumerable.Range(0, 8)
            .Select(_ => CreateInvoiceAsync(token, customer.Id))
            .ToArray();
        var invoices = await Task.WhenAll(requests);

        Assert.Equal(8, invoices.Select(invoice => invoice.InvoiceNumber).Distinct().Count());
    }

    [Fact]
    public async Task Create_AnotherUsersCustomer_ReturnsNotFound()
    {
        var (_, token) = await CreateUserWithTokenAsync("invoice-user-a@example.com");
        var (other, _) = await CreateUserWithTokenAsync("invoice-user-b@example.com");
        var customer = await CreateCustomerDirectlyAsync(other.Id, "Private", email: null);

        using var response = await SendJsonAsync(HttpMethod.Post, "/api/invoices", token, new
        {
            customerId = customer.Id,
            issueDate = IssueDate,
            dueDate = DueDate,
            items = new[] { new { description = "Service", quantity = 1m, unitPrice = 10m, taxRate = 0m } },
        });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Create_AdminCannotUseAnotherOwnersCustomer()
    {
        var (owner, _) = await CreateUserWithTokenAsync("invoice-admin-owner@example.com");
        var (_, adminToken) = await CreateUserWithTokenAsync("invoice-admin@example.com", AuthRoles.Admin);
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Owner Customer", email: null);

        using var response = await SendJsonAsync(HttpMethod.Post, "/api/invoices", adminToken, new
        {
            customerId = customer.Id,
            issueDate = IssueDate,
            dueDate = DueDate,
            items = new[] { new { description = "Service", quantity = 1m, unitPrice = 10m, taxRate = 0m } },
        });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData(0, 10, 20)]
    [InlineData(1, -1, 20)]
    [InlineData(1, 10, 101)]
    [InlineData(1.0001, 10, 20)]
    [InlineData(1, 10.001, 20)]
    [InlineData(1, 10, 20.001)]
    public async Task Create_InvalidItem_ReturnsBadRequestWithoutPartialPersistence(
        decimal quantity,
        decimal unitPrice,
        decimal taxRate)
    {
        var (owner, token) = await CreateUserWithTokenAsync($"invalid-invoice-{Guid.NewGuid():N}@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Invalid Item", email: null);

        using var response = await SendJsonAsync(HttpMethod.Post, "/api/invoices", token, new
        {
            customerId = customer.Id,
            issueDate = IssueDate,
            dueDate = DueDate,
            items = new[] { new { description = "Service", quantity, unitPrice, taxRate } },
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False(await dbContext.Invoices.AnyAsync());
        Assert.False(await dbContext.InvoiceItems.AnyAsync());
    }
}
