using System.Net.Http.Headers;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Customers;
using InvoiceFlow.Api.Features.Invoices;
using InvoiceFlow.Api.Infrastructure.Persistence;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InvoiceFlow.IntegrationTests;

/// <summary>
/// Shared helpers for customer integration tests: authenticated users, direct database
/// setup for bulk data, and JSON requests with a bearer token.
/// </summary>
public abstract class CustomerTestBase : AuthTestBase
{
    protected CustomerTestBase(PostgresContainerFixture fixture)
        : base(fixture)
    {
    }

    protected async Task<(ApplicationUser User, string Token)> CreateUserWithTokenAsync(
        string email,
        string? role = null)
    {
        var user = await CreateUserAsync(email, StrongPassword, role);
        var login = await LoginAsync(email);

        return (user, login.AccessToken);
    }

    protected async Task<HttpResponseMessage> SendJsonAsync(
        HttpMethod method,
        string url,
        string? token,
        object body)
    {
        using var request = new HttpRequestMessage(method, url);

        if (token is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        request.Content = JsonContent.Create(body);

        return await Client.SendAsync(request);
    }

    protected async Task<CustomerResponse> CreateCustomerAsync(
        string token,
        string name = "Acme Corporation",
        string? email = "billing@acme.com",
        string? phone = null,
        string? address = null,
        string? taxNumber = null)
    {
        using var response = await SendJsonAsync(HttpMethod.Post, "/api/customers", token, new
        {
            name,
            email,
            phone,
            address,
            taxNumber,
        });

        Assert.Equal(System.Net.HttpStatusCode.Created, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<CustomerResponse>();

        Assert.NotNull(payload);
        return payload;
    }

    protected async Task<Customer> CreateCustomerDirectlyAsync(
        Guid ownerId,
        string name,
        string? email = null,
        string? taxNumber = null)
    {
        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var customer = new Customer
        {
            Id = Guid.NewGuid(),
            OwnerId = ownerId,
            Name = name,
            Email = email,
            TaxNumber = taxNumber,
        };

        dbContext.Customers.Add(customer);
        await dbContext.SaveChangesAsync();

        return customer;
    }

    protected async Task<Invoice> CreateInvoiceDirectlyAsync(
        Guid ownerId,
        Guid customerId,
        bool withItem = false)
    {
        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            OwnerId = ownerId,
            CustomerId = customerId,
            InvoiceNumber = $"INV-{Guid.NewGuid():N}",
            IssueDate = new DateOnly(2026, 1, 15),
            DueDate = new DateOnly(2026, 2, 15),
        };

        dbContext.Invoices.Add(invoice);

        if (withItem)
        {
            dbContext.InvoiceItems.Add(new InvoiceItem
            {
                Id = Guid.NewGuid(),
                InvoiceId = invoice.Id,
                Description = "Consulting",
                Quantity = 1m,
                UnitPrice = 100m,
                TaxRate = 20m,
                LineSubtotal = 100m,
                LineTax = 20m,
                LineTotal = 120m,
            });
        }

        await dbContext.SaveChangesAsync();

        return invoice;
    }

    protected async Task<Customer?> FindCustomerAsync(Guid id)
    {
        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        return await dbContext.Customers
            .AsNoTracking()
            .SingleOrDefaultAsync(customer => customer.Id == id);
    }

    protected async Task<int> CountInvoicesAsync(Guid customerId)
    {
        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        return await dbContext.Invoices.CountAsync(invoice => invoice.CustomerId == customerId);
    }

    protected async Task<int> CountInvoiceItemsAsync(Guid invoiceId)
    {
        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        return await dbContext.InvoiceItems.CountAsync(item => item.InvoiceId == invoiceId);
    }

    protected static async Task<ProblemDetails> ReadProblemAsync(HttpResponseMessage response)
    {
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();

        Assert.NotNull(problem);
        return problem;
    }
}
