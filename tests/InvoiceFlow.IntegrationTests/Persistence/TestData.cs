using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Customers;
using InvoiceFlow.Api.Features.Invoices;

namespace InvoiceFlow.IntegrationTests.Persistence;

internal static class TestData
{
    public static ApplicationUser CreateUser(string email = "owner@example.com") =>
        new()
        {
            Id = Guid.NewGuid(),
            UserName = email,
            NormalizedUserName = email.ToUpperInvariant(),
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            SecurityStamp = Guid.NewGuid().ToString(),
        };

    public static Customer CreateCustomer(Guid ownerId, string name = "Acme Ltd.") =>
        new()
        {
            Id = Guid.NewGuid(),
            OwnerId = ownerId,
            Name = name,
            Email = "billing@acme.example",
        };

    public static Invoice CreateInvoice(
        Guid ownerId,
        Guid customerId,
        string invoiceNumber = "INV-2026-0001") =>
        new()
        {
            Id = Guid.NewGuid(),
            OwnerId = ownerId,
            CustomerId = customerId,
            InvoiceNumber = invoiceNumber,
            IssueDate = new DateOnly(2026, 1, 15),
            DueDate = new DateOnly(2026, 2, 15),
        };

    public static InvoiceItem CreateItem(Guid invoiceId, string description = "Consulting") =>
        new()
        {
            Id = Guid.NewGuid(),
            InvoiceId = invoiceId,
            Description = description,
            Quantity = 2m,
            UnitPrice = 100m,
            TaxRate = 20m,
            LineSubtotal = 200m,
            LineTax = 40m,
            LineTotal = 240m,
        };
}
