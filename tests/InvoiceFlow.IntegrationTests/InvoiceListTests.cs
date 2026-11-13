using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Invoices;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class InvoiceListTests(PostgresContainerFixture fixture) : InvoiceTestBase(fixture)
{
    [Fact]
    public async Task List_UserSeesOwnedInvoicesAndAdminSeesAll()
    {
        var (ownerA, tokenA) = await CreateUserWithTokenAsync("invoice-list-a@example.com");
        var (ownerB, tokenB) = await CreateUserWithTokenAsync("invoice-list-b@example.com");
        var (_, adminToken) = await CreateUserWithTokenAsync("invoice-list-admin@example.com", AuthRoles.Admin);
        var customerA = await CreateCustomerDirectlyAsync(ownerA.Id, "List A", email: null);
        var customerB = await CreateCustomerDirectlyAsync(ownerB.Id, "List B", email: null);
        await CreateInvoiceAsync(tokenA, customerA.Id);
        await CreateInvoiceAsync(tokenA, customerA.Id, issueDate: IssueDate.AddDays(1), dueDate: DueDate.AddDays(1));
        await CreateInvoiceAsync(tokenB, customerB.Id);

        var ownerPage = await GetPageAsync(tokenA, "/api/invoices?pageSize=100");
        var adminPage = await GetPageAsync(adminToken, "/api/invoices?pageSize=100");

        Assert.Equal(2, ownerPage.TotalCount);
        Assert.Equal(3, adminPage.TotalCount);
    }

    [Fact]
    public async Task List_AppliesCustomerDateStatusAndSearchFilters()
    {
        var (owner, token) = await CreateUserWithTokenAsync("invoice-filters@example.com");
        var firstCustomer = await CreateCustomerDirectlyAsync(owner.Id, "Filter A", email: null);
        var secondCustomer = await CreateCustomerDirectlyAsync(owner.Id, "Filter B", email: null);
        var first = await CreateInvoiceAsync(token, firstCustomer.Id, IssueDate, DueDate);
        await CreateInvoiceAsync(token, secondCustomer.Id, IssueDate.AddDays(10), DueDate.AddDays(10));

        var customerPage = await GetPageAsync(
            token,
            $"/api/invoices?customerId={firstCustomer.Id}&pageSize=100");
        var datePage = await GetPageAsync(
            token,
            $"/api/invoices?issueDateFrom={IssueDate:yyyy-MM-dd}&issueDateTo={IssueDate:yyyy-MM-dd}&pageSize=100");
        var statusPage = await GetPageAsync(token, "/api/invoices?status=draft&pageSize=100");
        var searchPage = await GetPageAsync(
            token,
            $"/api/invoices?search={Uri.EscapeDataString(first.InvoiceNumber[4..])}&pageSize=100");

        Assert.Single(customerPage.Items);
        Assert.Single(datePage.Items);
        Assert.Equal(2, statusPage.TotalCount);
        Assert.Contains(searchPage.Items, item => item.Id == first.Id);
    }

    [Fact]
    public async Task List_PaginatesAndSortsDeterministically()
    {
        var (owner, token) = await CreateUserWithTokenAsync("invoice-pagination@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Pagination", email: null);

        for (var index = 0; index < 25; index++)
        {
            await CreateInvoiceAsync(
                token,
                customer.Id,
                IssueDate.AddDays(index),
                DueDate.AddDays(index));
        }

        var page = await GetPageAsync(
            token,
            "/api/invoices?pageNumber=2&pageSize=10&sortBy=issueDate&sortDirection=asc");

        Assert.Equal(25, page.TotalCount);
        Assert.Equal(3, page.TotalPages);
        Assert.Equal(2, page.PageNumber);
        Assert.Equal(10, page.Items.Count);
        Assert.Equal(IssueDate.AddDays(10), page.Items[0].IssueDate);
    }

    [Theory]
    [InlineData("invoiceNumber", "asc")]
    [InlineData("invoiceNumber", "desc")]
    [InlineData("issueDate", "asc")]
    [InlineData("issueDate", "desc")]
    [InlineData("dueDate", "asc")]
    [InlineData("dueDate", "desc")]
    [InlineData("grandTotal", "asc")]
    [InlineData("grandTotal", "desc")]
    [InlineData("createdAt", "asc")]
    [InlineData("createdAt", "desc")]
    public async Task List_SortsByEveryDocumentedField(string sortBy, string sortDirection)
    {
        var (owner, token) = await CreateUserWithTokenAsync(
            $"invoice-sort-{sortBy}-{sortDirection}@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Sort Customer", email: null);

        // Insertion order (C, B, A) differs from issue-date order (A, B, C) and the
        // line quantities make grand-total order distinct as well.
        await CreateInvoiceAsync(
            token,
            customer.Id,
            IssueDate.AddDays(2),
            DueDate.AddDays(2),
            items: [new { description = "C", quantity = 3m, unitPrice = 10m, taxRate = 0m }]);
        await CreateInvoiceAsync(
            token,
            customer.Id,
            IssueDate.AddDays(1),
            DueDate.AddDays(1),
            items: [new { description = "B", quantity = 2m, unitPrice = 10m, taxRate = 0m }]);
        await CreateInvoiceAsync(
            token,
            customer.Id,
            IssueDate,
            DueDate,
            items: [new { description = "A", quantity = 1m, unitPrice = 10m, taxRate = 0m }]);

        await using var context = Fixture.CreateDbContext();
        var query = context.Invoices.Where(invoice => invoice.OwnerId == owner.Id);
        var descending = sortDirection == "desc";

        query = sortBy switch
        {
            "invoiceNumber" => descending
                ? query.OrderByDescending(invoice => invoice.InvoiceNumber).ThenBy(invoice => invoice.Id)
                : query.OrderBy(invoice => invoice.InvoiceNumber).ThenBy(invoice => invoice.Id),
            "issueDate" => descending
                ? query.OrderByDescending(invoice => invoice.IssueDate).ThenBy(invoice => invoice.Id)
                : query.OrderBy(invoice => invoice.IssueDate).ThenBy(invoice => invoice.Id),
            "dueDate" => descending
                ? query.OrderByDescending(invoice => invoice.DueDate).ThenBy(invoice => invoice.Id)
                : query.OrderBy(invoice => invoice.DueDate).ThenBy(invoice => invoice.Id),
            "grandTotal" => descending
                ? query.OrderByDescending(invoice => invoice.GrandTotal).ThenBy(invoice => invoice.Id)
                : query.OrderBy(invoice => invoice.GrandTotal).ThenBy(invoice => invoice.Id),
            "createdAt" => descending
                ? query.OrderByDescending(invoice => invoice.CreatedAt).ThenBy(invoice => invoice.Id)
                : query.OrderBy(invoice => invoice.CreatedAt).ThenBy(invoice => invoice.Id),
            _ => throw new InvalidOperationException($"Unexpected sort field '{sortBy}'."),
        };

        var expected = await query.Select(invoice => invoice.Id).ToListAsync();
        var page = await GetPageAsync(
            token,
            $"/api/invoices?sortBy={sortBy}&sortDirection={sortDirection}&pageSize=100");

        Assert.Equal(expected, page.Items.Select(item => item.Id));
    }

    [Theory]
    [InlineData("pageNumber=0")]
    [InlineData("pageSize=101")]
    [InlineData("status=Unknown")]
    [InlineData("sortBy=ownerId")]
    [InlineData("sortDirection=sideways")]
    [InlineData("issueDateFrom=2026-12-01&issueDateTo=2026-11-01")]
    public async Task List_InvalidQuery_ReturnsBadRequest(string query)
    {
        var (_, token) = await CreateUserWithTokenAsync($"invoice-query-{Guid.NewGuid():N}@example.com");

        using var response = await SendWithTokenAsync(HttpMethod.Get, $"/api/invoices?{query}", token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private async Task<InvoicePagedResponse<InvoiceSummaryResponse>> GetPageAsync(string token, string url)
    {
        using var response = await SendWithTokenAsync(HttpMethod.Get, url, token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<InvoicePagedResponse<InvoiceSummaryResponse>>();
        Assert.NotNull(payload);
        return payload;
    }
}
