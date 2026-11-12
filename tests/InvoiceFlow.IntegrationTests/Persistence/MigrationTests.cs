using Microsoft.EntityFrameworkCore;

namespace InvoiceFlow.IntegrationTests.Persistence;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class MigrationTests(PostgresContainerFixture fixture)
{
    [Fact]
    public async Task InitialMigration_IsAppliedAndNothingIsPending()
    {
        await using var context = fixture.CreateDbContext();

        var applied = await context.Database.GetAppliedMigrationsAsync();
        var pending = await context.Database.GetPendingMigrationsAsync();

        Assert.Contains(applied, migration => migration.EndsWith("_InitialCreate", StringComparison.Ordinal));
        Assert.Empty(pending);
    }

    [Fact]
    public async Task ExpectedTables_Exist()
    {
        await using var context = fixture.CreateDbContext();

        var tables = await context.Database
            .SqlQueryRaw<string>(
                """SELECT table_name AS "Value" FROM information_schema.tables WHERE table_schema = 'public'""")
            .ToListAsync();

        Assert.Contains("AspNetUsers", tables);
        Assert.Contains("AspNetRoles", tables);
        Assert.Contains("Customers", tables);
        Assert.Contains("Invoices", tables);
        Assert.Contains("InvoiceItems", tables);
    }
}
