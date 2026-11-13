using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Customers;
using InvoiceFlow.Api.Features.Invoices;
using InvoiceFlow.Api.Infrastructure.Persistence;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InvoiceFlow.IntegrationTests;

public abstract class InvoiceTestBase(PostgresContainerFixture fixture) : CustomerTestBase(fixture)
{
    protected static readonly DateOnly IssueDate = new(2026, 11, 12);
    protected static readonly DateOnly DueDate = new(2026, 11, 26);

    protected async Task<InvoiceResponse> CreateInvoiceAsync(
        string token,
        Guid customerId,
        DateOnly? issueDate = null,
        DateOnly? dueDate = null,
        object[]? items = null)
    {
        items ??=
        [
            new
            {
                description = "Backend API Development",
                quantity = 3m,
                unitPrice = 199.99m,
                taxRate = 20m,
            },
        ];

        using var response = await SendJsonAsync(HttpMethod.Post, "/api/invoices", token, new
        {
            customerId,
            issueDate = issueDate ?? IssueDate,
            dueDate = dueDate ?? DueDate,
            items,
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<InvoiceResponse>();
        Assert.NotNull(payload);
        return payload;
    }

    protected async Task<Invoice?> FindInvoiceAsync(Guid id, bool includeItems = true)
    {
        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        IQueryable<Invoice> query = dbContext.Invoices.AsNoTracking();

        if (includeItems)
        {
            query = query.Include(invoice => invoice.Items);
        }

        return await query.SingleOrDefaultAsync(invoice => invoice.Id == id);
    }

    protected async Task<Customer?> FindCustomerByIdAsync(Guid id)
    {
        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await dbContext.Customers.AsNoTracking().SingleOrDefaultAsync(customer => customer.Id == id);
    }

    protected async Task SetInvoiceStatusAsync(Guid id, InvoiceStatus status)
    {
        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var invoice = await dbContext.Invoices.SingleAsync(candidate => candidate.Id == id);
        invoice.Status = status;
        await dbContext.SaveChangesAsync();
    }

    protected async Task TouchInvoiceAsync(Guid id)
    {
        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var invoice = await dbContext.Invoices.SingleAsync(candidate => candidate.Id == id);
        invoice.DueDate = invoice.DueDate.AddDays(1);
        await dbContext.SaveChangesAsync();
    }

    protected async Task<InvoiceResponse> GetInvoiceAsync(string token, Guid id)
    {
        using var response = await SendWithTokenAsync(HttpMethod.Get, $"/api/invoices/{id}", token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<InvoiceResponse>();
        Assert.NotNull(payload);
        return payload;
    }

    protected static object ValidUpdateBody(
        Guid customerId,
        string concurrencyToken,
        object[]? items = null) =>
        new
        {
            customerId,
            issueDate = IssueDate.AddDays(1),
            dueDate = DueDate.AddDays(1),
            concurrencyToken,
            items = items ??
            [
                new
                {
                    description = "Updated service",
                    quantity = 2.5m,
                    unitPrice = 100m,
                    taxRate = 10m,
                },
            ],
        };
}
