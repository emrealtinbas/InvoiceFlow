using InvoiceFlow.Api.Features.Invoices;
using Microsoft.EntityFrameworkCore;

namespace InvoiceFlow.IntegrationTests.Persistence;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class EntityPersistenceTests(PostgresContainerFixture fixture) : IAsyncLifetime
{
    public Task InitializeAsync() => fixture.ResetDatabaseAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task ApplicationUser_CanBePersisted()
    {
        await using var context = fixture.CreateDbContext();
        var user = TestData.CreateUser();

        context.Users.Add(user);
        await context.SaveChangesAsync();

        await using var readContext = fixture.CreateDbContext();
        var saved = await readContext.Users.SingleAsync(candidate => candidate.Id == user.Id);

        Assert.Equal(user.Email, saved.Email);
        Assert.Equal(user.NormalizedUserName, saved.NormalizedUserName);
        Assert.NotEqual(default, saved.CreatedAt);
        Assert.Equal(DateTimeKind.Utc, saved.CreatedAt.Kind);
        Assert.Null(saved.UpdatedAt);
    }

    [Fact]
    public async Task Customer_CanBePersistedWithOwner()
    {
        await using var context = fixture.CreateDbContext();
        var user = TestData.CreateUser();
        var customer = TestData.CreateCustomer(user.Id);

        context.Users.Add(user);
        context.Customers.Add(customer);
        await context.SaveChangesAsync();

        await using var readContext = fixture.CreateDbContext();
        var saved = await readContext.Customers.SingleAsync(candidate => candidate.Id == customer.Id);

        Assert.Equal(user.Id, saved.OwnerId);
        Assert.Equal(customer.Name, saved.Name);
        Assert.Equal(DateTimeKind.Utc, saved.CreatedAt.Kind);
    }

    [Fact]
    public async Task Invoice_CanBePersistedWithCustomerAndOwner()
    {
        await using var context = fixture.CreateDbContext();
        var user = TestData.CreateUser();
        var customer = TestData.CreateCustomer(user.Id);
        var invoice = TestData.CreateInvoice(user.Id, customer.Id);

        context.Users.Add(user);
        context.Customers.Add(customer);
        context.Invoices.Add(invoice);
        await context.SaveChangesAsync();

        await using var readContext = fixture.CreateDbContext();
        var saved = await readContext.Invoices.SingleAsync(candidate => candidate.Id == invoice.Id);

        Assert.Equal(user.Id, saved.OwnerId);
        Assert.Equal(customer.Id, saved.CustomerId);
        Assert.Equal(InvoiceStatus.Draft, saved.Status);
        Assert.Equal("TRY", saved.Currency);
        Assert.Equal(new DateOnly(2026, 1, 15), saved.IssueDate);
        Assert.Equal(new DateOnly(2026, 2, 15), saved.DueDate);
    }

    [Fact]
    public async Task InvoiceItems_CanBePersisted()
    {
        await using var context = fixture.CreateDbContext();
        var user = TestData.CreateUser();
        var customer = TestData.CreateCustomer(user.Id);
        var invoice = TestData.CreateInvoice(user.Id, customer.Id);
        var item = TestData.CreateItem(invoice.Id);

        context.Users.Add(user);
        context.Customers.Add(customer);
        context.Invoices.Add(invoice);
        context.InvoiceItems.Add(item);
        await context.SaveChangesAsync();

        await using var readContext = fixture.CreateDbContext();
        var saved = await readContext.InvoiceItems.SingleAsync(candidate => candidate.Id == item.Id);

        Assert.Equal(invoice.Id, saved.InvoiceId);
        Assert.Equal(item.Description, saved.Description);
        Assert.Equal(item.Quantity, saved.Quantity);
        Assert.Equal(item.UnitPrice, saved.UnitPrice);
        Assert.Equal(item.TaxRate, saved.TaxRate);
        Assert.Equal(item.LineTotal, saved.LineTotal);
    }

    [Fact]
    public async Task InvoiceStatus_IsStoredAsString()
    {
        await using var context = fixture.CreateDbContext();
        var user = TestData.CreateUser();
        var customer = TestData.CreateCustomer(user.Id);
        var invoice = TestData.CreateInvoice(user.Id, customer.Id);

        context.Users.Add(user);
        context.Customers.Add(customer);
        context.Invoices.Add(invoice);
        await context.SaveChangesAsync();

        var storedStatus = await context.Database
            .SqlQueryRaw<string>(
                """SELECT "Status" AS "Value" FROM "Invoices" WHERE "Id" = {0}""",
                invoice.Id)
            .SingleAsync();

        Assert.Equal("Draft", storedStatus);
    }
}
