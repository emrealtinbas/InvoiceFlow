using InvoiceFlow.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;

namespace InvoiceFlow.IntegrationTests.Persistence;

/// <summary>
/// Starts a single PostgreSQL container for the whole test collection, applies the real
/// EF Core migrations once, and provides a clean database for every test.
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
    }
}
