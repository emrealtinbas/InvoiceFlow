namespace InvoiceFlow.IntegrationTests.Persistence;

[CollectionDefinition(Name)]
public sealed class PostgresDatabaseGroup : ICollectionFixture<PostgresContainerFixture>
{
    public const string Name = "postgres";
}
