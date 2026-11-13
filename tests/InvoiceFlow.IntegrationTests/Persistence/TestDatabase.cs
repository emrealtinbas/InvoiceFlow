namespace InvoiceFlow.IntegrationTests.Persistence;

/// <summary>
/// Test-only database endpoints. Tests that need PostgreSQL always use the
/// Testcontainers connection string. Tests that must not touch a database use the
/// unreachable address below, so a developer's local database can never be modified
/// by an accidentally database-dependent test.
/// </summary>
internal static class TestDatabase
{
    public const string UnavailableConnectionString =
        "Host=127.0.0.1;Port=1;Database=invoiceflow_tests_unavailable;" +
        "Username=none;Password=none;Timeout=2";
}
