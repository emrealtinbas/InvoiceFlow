namespace InvoiceFlow.IntegrationTests.Persistence;

/// <summary>
/// All PostgreSQL-backed tests join this collection, so xUnit serializes them against
/// one shared container. Database truncation in <see cref="PostgresContainerFixture"/>
/// therefore cannot race with another database test. Tests that do not use PostgreSQL
/// remain in separate collections and can run in parallel.
/// </summary>
[CollectionDefinition(Name)]
public sealed class PostgresDatabaseGroup : ICollectionFixture<PostgresContainerFixture>
{
    public const string Name = "postgres";
}
