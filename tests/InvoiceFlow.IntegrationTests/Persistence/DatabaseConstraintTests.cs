using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Customers;
using InvoiceFlow.Api.Features.Invoices;
using InvoiceFlow.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InvoiceFlow.IntegrationTests.Persistence;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class DatabaseConstraintTests(PostgresContainerFixture fixture) : IAsyncLifetime
{
    public Task InitializeAsync() => fixture.ResetDatabaseAsync();

    public Task DisposeAsync() => Task.CompletedTask;

    [Fact]
    public async Task DuplicateInvoiceNumber_IsRejected()
    {
        await using var context = fixture.CreateDbContext();
        var (user, customer) = await AddOwnerAndCustomerAsync(context);
        var first = TestData.CreateInvoice(user.Id, customer.Id, "INV-2026-0001");
        var second = TestData.CreateInvoice(user.Id, customer.Id, "INV-2026-0001");

        context.Invoices.AddRange(first, second);

        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    [Fact]
    public async Task InvoiceWithUnknownCustomer_IsRejected()
    {
        await using var context = fixture.CreateDbContext();
        var (user, _) = await AddOwnerAndCustomerAsync(context);
        var invoice = TestData.CreateInvoice(user.Id, Guid.NewGuid());

        context.Invoices.Add(invoice);

        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    [Fact]
    public async Task InvoiceOwnerMustMatchCustomerOwner()
    {
        await using var context = fixture.CreateDbContext();
        var (owner, customer) = await AddOwnerAndCustomerAsync(context);
        var otherUser = TestData.CreateUser("other@example.com");
        context.Users.Add(otherUser);

        var invoice = TestData.CreateInvoice(otherUser.Id, customer.Id);
        context.Invoices.Add(invoice);

        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    [Fact]
    public async Task CustomerWithInvoices_CannotBeDeleted()
    {
        await using var context = fixture.CreateDbContext();
        var (user, customer) = await AddOwnerAndCustomerAsync(context);
        var invoice = TestData.CreateInvoice(user.Id, customer.Id);
        context.Invoices.Add(invoice);
        await context.SaveChangesAsync();

        await using var deleteContext = fixture.CreateDbContext();
        var trackedCustomer = await deleteContext.Customers.SingleAsync(c => c.Id == customer.Id);
        deleteContext.Customers.Remove(trackedCustomer);

        await Assert.ThrowsAsync<DbUpdateException>(() => deleteContext.SaveChangesAsync());
    }

    [Fact]
    public async Task CustomerName_IsRequired()
    {
        await using var context = fixture.CreateDbContext();
        var user = TestData.CreateUser();
        context.Users.Add(user);

        context.Customers.Add(new Customer { Id = Guid.NewGuid(), OwnerId = user.Id, Name = null! });

        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    [Fact]
    public async Task CustomerName_CannotBeBlank()
    {
        await using var context = fixture.CreateDbContext();
        var user = TestData.CreateUser();
        context.Users.Add(user);

        context.Customers.Add(new Customer { Id = Guid.NewGuid(), OwnerId = user.Id, Name = "   " });

        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    [Fact]
    public async Task InvoiceItemQuantity_MustBePositive()
    {
        await using var context = fixture.CreateDbContext();
        var invoice = await AddInvoiceGraphAsync(context);
        var item = TestData.CreateItem(invoice.Id);
        item.Quantity = 0m;

        context.InvoiceItems.Add(item);

        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    [Fact]
    public async Task InvoiceItemTaxRate_MustBeWithinRange()
    {
        await using var context = fixture.CreateDbContext();
        var invoice = await AddInvoiceGraphAsync(context);
        var item = TestData.CreateItem(invoice.Id);
        item.TaxRate = 101m;

        context.InvoiceItems.Add(item);

        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    [Fact]
    public async Task InvoiceItemUnitPrice_CannotBeNegative()
    {
        await using var context = fixture.CreateDbContext();
        var invoice = await AddInvoiceGraphAsync(context);
        var item = TestData.CreateItem(invoice.Id);
        item.UnitPrice = -1m;

        context.InvoiceItems.Add(item);

        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    private static async Task<(ApplicationUser User, Customer Customer)>
        AddOwnerAndCustomerAsync(AppDbContext context)
    {
        var user = TestData.CreateUser();
        var customer = TestData.CreateCustomer(user.Id);

        context.Users.Add(user);
        context.Customers.Add(customer);
        await context.SaveChangesAsync();

        return (user, customer);
    }

    private static async Task<Invoice> AddInvoiceGraphAsync(AppDbContext context)
    {
        var user = TestData.CreateUser();
        var customer = TestData.CreateCustomer(user.Id);
        var invoice = TestData.CreateInvoice(user.Id, customer.Id);

        context.Users.Add(user);
        context.Customers.Add(customer);
        context.Invoices.Add(invoice);
        await context.SaveChangesAsync();

        return invoice;
    }
}
