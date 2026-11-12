using System.Net;
using InvoiceFlow.Api.Features.Customers;
using InvoiceFlow.Api.Features.Invoices;
using InvoiceFlow.Api.Infrastructure.Persistence;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class CustomerDatabaseTests(PostgresContainerFixture fixture) : CustomerTestBase(fixture)
{
    [Fact]
    public async Task ConcurrentRequests_WithSameEmail_ResultInOneCustomer()
    {
        var (_, token) = await CreateUserWithTokenAsync("concurrent-owner@example.com");

        var requests = Enumerable.Range(0, 2)
            .Select(_ => SendJsonAsync(HttpMethod.Post, "/api/customers", token, new
            {
                name = "Concurrent Customer",
                email = "race@acme.com",
            }))
            .ToArray();

        var responses = await Task.WhenAll(requests);

        try
        {
            var statuses = responses
                .Select(response => response.StatusCode)
                .OrderBy(status => status)
                .ToArray();

            Assert.Equal(ExpectedConcurrentStatuses, statuses);
        }
        finally
        {
            foreach (var response in responses)
            {
                response.Dispose();
            }
        }

        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        Assert.Equal(
            1,
            await dbContext.Customers.CountAsync(customer => customer.Email == "race@acme.com"));
    }

    [Fact]
    public async Task Database_RejectsCaseInsensitiveDuplicateEmailForSameOwner()
    {
        var owner = await CreateUserAsync("database-duplicate@example.com");
        await CreateCustomerDirectlyAsync(owner.Id, "First", "billing@acme.com");

        await Assert.ThrowsAsync<DbUpdateException>(() =>
            CreateCustomerDirectlyAsync(owner.Id, "Second", "Billing@Acme.com"));
    }

    [Fact]
    public async Task Database_EnforcesCustomerOwnershipCompositeForeignKey()
    {
        var owner = await CreateUserAsync("fk-owner@example.com");
        var other = await CreateUserAsync("fk-other@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "FK Customer");

        await using var scope = Factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        dbContext.Invoices.Add(new Invoice
        {
            Id = Guid.NewGuid(),
            OwnerId = other.Id,
            CustomerId = customer.Id,
            InvoiceNumber = $"INV-{Guid.NewGuid():N}",
            IssueDate = new DateOnly(2026, 1, 15),
            DueDate = new DateOnly(2026, 2, 15),
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => dbContext.SaveChangesAsync());
    }

    [Fact]
    public async Task CustomerEmailUniquenessMigration_IsAppliedAndIndexExists()
    {
        await using var context = Fixture.CreateDbContext();

        var applied = await context.Database.GetAppliedMigrationsAsync();
        var pending = await context.Database.GetPendingMigrationsAsync();

        Assert.Contains(
            applied,
            migration => migration.EndsWith("_CustomerEmailUniqueness", StringComparison.Ordinal));
        Assert.Empty(pending);

        var indexes = await context.Database
            .SqlQueryRaw<string>(
                """SELECT indexname AS "Value" FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'Customers'""")
            .ToListAsync();

        Assert.Contains("UX_Customers_OwnerId_Email_Lower", indexes);
    }

    [Fact]
    public async Task ExistingHealthAndAuthenticationEndpoints_StillWork()
    {
        using var health = await Client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, health.StatusCode);

        var (_, token) = await CreateUserWithTokenAsync("smoke@example.com");

        using var me = await SendWithTokenAsync(HttpMethod.Get, "/api/auth/me", token);

        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
    }

    private static readonly HttpStatusCode[] ExpectedConcurrentStatuses =
    [
        HttpStatusCode.Created,
        HttpStatusCode.Conflict,
    ];
}
