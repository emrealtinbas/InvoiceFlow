using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Customers;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class CustomerListTests(PostgresContainerFixture fixture) : CustomerTestBase(fixture)
{
    [Fact]
    public async Task List_AsUser_ReturnsOnlyOwnedCustomers()
    {
        var (owner, token) = await CreateUserWithTokenAsync("list-owner@example.com");
        var (other, _) = await CreateUserWithTokenAsync("list-other@example.com");

        var first = await CreateCustomerDirectlyAsync(owner.Id, "Owner Alpha");
        var second = await CreateCustomerDirectlyAsync(owner.Id, "Owner Bravo");
        await CreateCustomerDirectlyAsync(other.Id, "Other Charlie");
        await CreateCustomerDirectlyAsync(other.Id, "Other Delta");
        await CreateCustomerDirectlyAsync(other.Id, "Other Echo");

        using var response = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/customers?pageSize=100",
            token);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<PagedResponse<CustomerResponse>>();

        Assert.NotNull(payload);
        Assert.Equal(2, payload.TotalCount);
        Assert.Equal(2, payload.Items.Count);
        Assert.Contains(payload.Items, item => item.Id == first.Id);
        Assert.Contains(payload.Items, item => item.Id == second.Id);
        Assert.DoesNotContain(payload.Items, item => item.Name.StartsWith("Other", StringComparison.Ordinal));
    }

    [Fact]
    public async Task List_AsAdmin_ReturnsAllCustomers()
    {
        var (ownerA, _) = await CreateUserWithTokenAsync("list-admin-owner-a@example.com");
        var (ownerB, _) = await CreateUserWithTokenAsync("list-admin-owner-b@example.com");
        var (_, adminToken) = await CreateUserWithTokenAsync("list-admin@example.com", AuthRoles.Admin);

        await CreateCustomerDirectlyAsync(ownerA.Id, "Admin A One");
        await CreateCustomerDirectlyAsync(ownerA.Id, "Admin A Two");
        await CreateCustomerDirectlyAsync(ownerB.Id, "Admin B One");
        await CreateCustomerDirectlyAsync(ownerB.Id, "Admin B Two");
        await CreateCustomerDirectlyAsync(ownerB.Id, "Admin B Three");

        using var response = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/customers?pageSize=100",
            adminToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<PagedResponse<CustomerResponse>>();

        Assert.NotNull(payload);
        Assert.Equal(5, payload.TotalCount);
        Assert.Equal(5, payload.Items.Count);
    }

    [Fact]
    public async Task List_Search_IsCaseInsensitive()
    {
        var (owner, token) = await CreateUserWithTokenAsync("search-case@example.com");
        await CreateCustomerDirectlyAsync(owner.Id, "Acme Corporation");
        await CreateCustomerDirectlyAsync(owner.Id, "Beta Industries");

        using var lower = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/customers?search=acme&pageSize=100",
            token);
        using var upper = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/customers?search=ACME&pageSize=100",
            token);

        var lowerPayload = await lower.Content.ReadFromJsonAsync<PagedResponse<CustomerResponse>>();
        var upperPayload = await upper.Content.ReadFromJsonAsync<PagedResponse<CustomerResponse>>();

        Assert.NotNull(lowerPayload);
        Assert.NotNull(upperPayload);
        Assert.Equal(1, lowerPayload.TotalCount);
        Assert.Equal(1, upperPayload.TotalCount);
        Assert.Equal("Acme Corporation", lowerPayload.Items.Single().Name);
        Assert.Equal("Acme Corporation", upperPayload.Items.Single().Name);
    }

    [Fact]
    public async Task List_Search_MatchesNameEmailAndTaxNumber()
    {
        var (owner, token) = await CreateUserWithTokenAsync("search-fields@example.com");
        await CreateCustomerDirectlyAsync(
            owner.Id,
            "Northwind Traders",
            email: "contact@northwind.example",
            taxNumber: "9876543210");
        await CreateCustomerDirectlyAsync(owner.Id, "Contoso Ltd");

        var queries = new[]
        {
            "/api/customers?search=northwind&pageSize=100",
            "/api/customers?search=CONTACT%40NORTHWIND&pageSize=100",
            "/api/customers?search=987654&pageSize=100",
        };

        foreach (var query in queries)
        {
            using var response = await SendWithTokenAsync(HttpMethod.Get, query, token);

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);

            var payload = await response.Content.ReadFromJsonAsync<PagedResponse<CustomerResponse>>();

            Assert.NotNull(payload);
            Assert.Equal(1, payload.TotalCount);
            Assert.Equal("Northwind Traders", payload.Items.Single().Name);
        }
    }

    [Fact]
    public async Task List_Pagination_ReturnsCorrectMetadata()
    {
        var (owner, token) = await CreateUserWithTokenAsync("pagination@example.com");

        for (var index = 0; index < 25; index++)
        {
            await CreateCustomerDirectlyAsync(owner.Id, $"Paged Customer {index:D2}");
        }

        using var firstPage = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/customers?page=1&pageSize=10",
            token);
        using var thirdPage = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/customers?page=3&pageSize=10",
            token);

        var firstPayload = await firstPage.Content.ReadFromJsonAsync<PagedResponse<CustomerResponse>>();
        var thirdPayload = await thirdPage.Content.ReadFromJsonAsync<PagedResponse<CustomerResponse>>();

        Assert.NotNull(firstPayload);
        Assert.NotNull(thirdPayload);
        Assert.Equal(1, firstPayload.Page);
        Assert.Equal(10, firstPayload.PageSize);
        Assert.Equal(25, firstPayload.TotalCount);
        Assert.Equal(3, firstPayload.TotalPages);
        Assert.Equal(10, firstPayload.Items.Count);

        Assert.Equal(3, thirdPayload.Page);
        Assert.Equal(5, thirdPayload.Items.Count);
    }

    [Theory]
    [InlineData("page=0")]
    [InlineData("page=-1")]
    [InlineData("pageSize=0")]
    [InlineData("pageSize=101")]
    public async Task List_WithInvalidPagination_ReturnsBadRequest(string queryString)
    {
        var (_, token) = await CreateUserWithTokenAsync($"pagination-invalid-{Guid.NewGuid():N}@example.com");

        using var response = await SendWithTokenAsync(
            HttpMethod.Get,
            $"/api/customers?{queryString}",
            token);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task List_Sorting_IsDeterministicWithIdTieBreaker()
    {
        var (owner, token) = await CreateUserWithTokenAsync("sorting@example.com");

        await CreateCustomerDirectlyAsync(owner.Id, "Alpha");
        await CreateCustomerDirectlyAsync(owner.Id, "Bravo");
        await CreateCustomerDirectlyAsync(owner.Id, "Bravo");
        await CreateCustomerDirectlyAsync(owner.Id, "Charlie");
        await CreateCustomerDirectlyAsync(owner.Id, "Delta");

        await using var context = Fixture.CreateDbContext();
        var expectedAscending = await context.Customers
            .Where(customer => customer.OwnerId == owner.Id)
            .OrderBy(customer => customer.Name)
            .ThenBy(customer => customer.Id)
            .Select(customer => customer.Id)
            .ToListAsync();
        var expectedDescending = await context.Customers
            .Where(customer => customer.OwnerId == owner.Id)
            .OrderByDescending(customer => customer.Name)
            .ThenBy(customer => customer.Id)
            .Select(customer => customer.Id)
            .ToListAsync();

        using var ascending = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/customers?sortBy=name&sortDirection=asc&pageSize=100",
            token);
        using var descending = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/customers?sortBy=name&sortDirection=desc&pageSize=100",
            token);

        var ascendingPayload = await ascending.Content.ReadFromJsonAsync<PagedResponse<CustomerResponse>>();
        var descendingPayload = await descending.Content.ReadFromJsonAsync<PagedResponse<CustomerResponse>>();

        Assert.NotNull(ascendingPayload);
        Assert.NotNull(descendingPayload);
        Assert.Equal(expectedAscending, ascendingPayload.Items.Select(item => item.Id));
        Assert.Equal(expectedDescending, descendingPayload.Items.Select(item => item.Id));
    }

    [Fact]
    public async Task List_EnforcesPageSizeLimit()
    {
        var (owner, token) = await CreateUserWithTokenAsync("page-size@example.com");

        for (var index = 0; index < 3; index++)
        {
            await CreateCustomerDirectlyAsync(owner.Id, $"Page Size {index}");
        }

        using var allowed = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/customers?pageSize=100",
            token);
        using var rejected = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/customers?pageSize=101",
            token);

        Assert.Equal(HttpStatusCode.OK, allowed.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
    }

    [Fact]
    public async Task List_FiltersBeforePagination()
    {
        var (owner, token) = await CreateUserWithTokenAsync("filter-pagination@example.com");

        for (var index = 0; index < 25; index++)
        {
            await CreateCustomerDirectlyAsync(owner.Id, $"Unrelated Customer {index:D2}");
        }

        for (var index = 0; index < 5; index++)
        {
            await CreateCustomerDirectlyAsync(owner.Id, $"Match Customer {index:D2}");
        }

        using var firstPage = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/customers?search=Match&page=1&pageSize=2",
            token);
        using var lastPage = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/customers?search=Match&page=3&pageSize=2",
            token);

        var firstPayload = await firstPage.Content.ReadFromJsonAsync<PagedResponse<CustomerResponse>>();
        var lastPayload = await lastPage.Content.ReadFromJsonAsync<PagedResponse<CustomerResponse>>();

        Assert.NotNull(firstPayload);
        Assert.NotNull(lastPayload);
        Assert.Equal(5, firstPayload.TotalCount);
        Assert.Equal(3, firstPayload.TotalPages);
        Assert.Equal(2, firstPayload.Items.Count);
        Assert.All(firstPayload.Items, item => Assert.StartsWith("Match", item.Name, StringComparison.Ordinal));
        Assert.Single(lastPayload.Items);
        Assert.StartsWith("Match", lastPayload.Items[0].Name, StringComparison.Ordinal);
    }
}
