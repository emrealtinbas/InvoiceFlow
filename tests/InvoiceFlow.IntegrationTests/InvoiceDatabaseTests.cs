using InvoiceFlow.Api.Features.Invoices;
using InvoiceFlow.Api.Infrastructure.Persistence;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class InvoiceDatabaseTests(PostgresContainerFixture fixture) : InvoiceTestBase(fixture)
{
    [Fact]
    public async Task InvoiceNumberSequenceMigration_IsAppliedAndSequenceExists()
    {
        await using var context = Fixture.CreateDbContext();
        var applied = await context.Database.GetAppliedMigrationsAsync();
        var pending = await context.Database.GetPendingMigrationsAsync();
        var sequences = await context.Database
            .SqlQueryRaw<string>(
                """SELECT sequencename AS "Value" FROM pg_sequences WHERE schemaname = 'public'""")
            .ToListAsync();

        Assert.Contains(
            applied,
            migration => migration.EndsWith("_InvoiceNumberSequence", StringComparison.Ordinal));
        Assert.Empty(pending);
        Assert.Contains("InvoiceNumberSequence", sequences);
    }

    [Fact]
    public async Task Database_RejectsDuplicateInvoiceNumber()
    {
        var owner = await CreateUserAsync("invoice-db-unique@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "DB Unique", email: null);

        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        dbContext.Invoices.Add(CreateDirectInvoice(owner.Id, customer.Id, "INV-2026-999999"));
        await dbContext.SaveChangesAsync();
        dbContext.Invoices.Add(CreateDirectInvoice(owner.Id, customer.Id, "INV-2026-999999"));

        await Assert.ThrowsAsync<DbUpdateException>(() => dbContext.SaveChangesAsync());
    }

    private static Invoice CreateDirectInvoice(Guid ownerId, Guid customerId, string number) =>
        new()
        {
            Id = Guid.NewGuid(),
            OwnerId = ownerId,
            CustomerId = customerId,
            InvoiceNumber = number,
            IssueDate = IssueDate,
            DueDate = DueDate,
        };
}
