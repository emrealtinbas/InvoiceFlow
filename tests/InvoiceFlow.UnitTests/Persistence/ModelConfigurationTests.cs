using InvoiceFlow.Api.Features.Customers;
using InvoiceFlow.Api.Features.Invoices;
using InvoiceFlow.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace InvoiceFlow.UnitTests.Persistence;

public sealed class ModelConfigurationTests
{
    [Fact]
    public void NewInvoice_DefaultsToDraftStatusAndTryCurrency()
    {
        var invoice = new Invoice { InvoiceNumber = "INV-2026-0001" };

        Assert.Equal(InvoiceStatus.Draft, invoice.Status);
        Assert.Equal("TRY", invoice.Currency);
        Assert.Equal(0m, invoice.Subtotal);
    }

    [Fact]
    public void InvoiceNumber_IsRequiredUniqueAndLimitedTo50Characters()
    {
        using var context = CreateContext();
        var entityType = context.Model.FindEntityType(typeof(Invoice))!;
        var property = entityType.FindProperty(nameof(Invoice.InvoiceNumber))!;

        Assert.False(property.IsNullable);
        Assert.Equal(50, property.GetMaxLength());

        var index = Assert.Single(
            entityType.GetIndexes(),
            candidate => candidate.Properties.Contains(property));

        Assert.True(index.IsUnique);
    }

    [Fact]
    public void InvoiceStatus_IsPersistedAsString()
    {
        using var context = CreateContext();
        var property = context.Model.FindEntityType(typeof(Invoice))!
            .FindProperty(nameof(Invoice.Status))!;

        Assert.Equal(typeof(string), property.GetProviderClrType());
        Assert.Equal(20, property.GetMaxLength());
    }

    [Fact]
    public void InvoiceVersion_IsMappedToXminAsConcurrencyToken()
    {
        using var context = CreateContext();
        var property = context.Model.FindEntityType(typeof(Invoice))!
            .FindProperty(nameof(Invoice.Version))!;

        Assert.True(property.IsConcurrencyToken);
        Assert.Equal(ValueGenerated.OnAddOrUpdate, property.ValueGenerated);
    }

    [Fact]
    public void FinancialColumns_UseExpectedPrecisionAndScale()
    {
        using var context = CreateContext();
        var invoice = context.Model.FindEntityType(typeof(Invoice))!;
        var item = context.Model.FindEntityType(typeof(InvoiceItem))!;

        AssertPrecision(invoice, nameof(Invoice.Subtotal), 18, 2);
        AssertPrecision(invoice, nameof(Invoice.TaxTotal), 18, 2);
        AssertPrecision(invoice, nameof(Invoice.GrandTotal), 18, 2);
        AssertPrecision(item, nameof(InvoiceItem.Quantity), 18, 3);
        AssertPrecision(item, nameof(InvoiceItem.UnitPrice), 18, 2);
        AssertPrecision(item, nameof(InvoiceItem.TaxRate), 5, 2);
        AssertPrecision(item, nameof(InvoiceItem.LineSubtotal), 18, 2);
        AssertPrecision(item, nameof(InvoiceItem.LineTax), 18, 2);
        AssertPrecision(item, nameof(InvoiceItem.LineTotal), 18, 2);
    }

    [Fact]
    public void InvoiceCustomerRelationship_IsRestrictedAndOwnerScoped()
    {
        using var context = CreateContext();
        var entityType = context.Model.FindEntityType(typeof(Invoice))!;

        var foreignKey = Assert.Single(
            entityType.GetForeignKeys(),
            candidate => candidate.PrincipalEntityType.ClrType == typeof(Customer));

        Assert.Equal(DeleteBehavior.Restrict, foreignKey.DeleteBehavior);
        Assert.Equal(
            new[] { nameof(Invoice.CustomerId), nameof(Invoice.OwnerId) },
            foreignKey.Properties.Select(property => property.Name));
    }

    [Fact]
    public void InvoiceItems_CascadeDeleteWithInvoice()
    {
        using var context = CreateContext();
        var entityType = context.Model.FindEntityType(typeof(InvoiceItem))!;
        var foreignKey = Assert.Single(entityType.GetForeignKeys());

        Assert.Equal(DeleteBehavior.Cascade, foreignKey.DeleteBehavior);
    }

    [Fact]
    public void CustomerAndInvoice_RequireAnOwner()
    {
        using var context = CreateContext();
        var customerOwner = context.Model.FindEntityType(typeof(Customer))!
            .FindProperty(nameof(Customer.OwnerId))!;
        var invoiceOwner = context.Model.FindEntityType(typeof(Invoice))!
            .FindProperty(nameof(Invoice.OwnerId))!;

        Assert.False(customerOwner.IsNullable);
        Assert.False(invoiceOwner.IsNullable);
    }

    private static void AssertPrecision(IEntityType entityType, string propertyName, int precision, int scale)
    {
        var property = entityType.FindProperty(propertyName)!;

        Assert.Equal(precision, property.GetPrecision());
        Assert.Equal(scale, property.GetScale());
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Database=invoiceflow;Username=invoiceflow")
            .Options;

        return new AppDbContext(options);
    }
}
