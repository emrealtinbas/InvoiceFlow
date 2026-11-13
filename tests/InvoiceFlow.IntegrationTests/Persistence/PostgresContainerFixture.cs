using InvoiceFlow.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;

namespace InvoiceFlow.IntegrationTests.Persistence;

/// <summary>
/// Starts a single PostgreSQL container for the whole test collection, applies the real
/// EF Core migrations once, and provides a clean database for every test.
/// Isolation strategy: one container per collection; every database test truncates all
/// application tables and restarts the invoice-number sequence before it runs. The
/// collection serializes tests, so reset cannot overlap another test.
/// </summary>
public sealed class PostgresContainerFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:17-alpine").Build();

    public string ConnectionString => _container.GetConnectionString();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();

        await using var context = CreateDbContext();
        await context.Database.MigrateAsync();
    }

    public Task DisposeAsync() => _container.DisposeAsync().AsTask();

    public AppDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(ConnectionString)
            .Options;

        return new AppDbContext(options);
    }

    public async Task ResetDatabaseAsync()
    {
        await using var context = CreateDbContext();

        await context.Database.ExecuteSqlRawAsync(
            """
            TRUNCATE TABLE
                "InvoiceItems",
                "Invoices",
                "Customers",
                "AspNetUserRoles",
                "AspNetUserClaims",
                "AspNetUserLogins",
                "AspNetUserTokens",
                "AspNetRoleClaims",
                "AspNetRoles",
                "AspNetUsers"
            RESTART IDENTITY CASCADE;
            """);

        await context.Database.ExecuteSqlRawAsync(
            """ALTER SEQUENCE "InvoiceNumberSequence" RESTART WITH 1;""");
    }
}
