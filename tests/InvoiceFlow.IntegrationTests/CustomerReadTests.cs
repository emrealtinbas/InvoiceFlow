using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Customers;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.AspNetCore.Mvc;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class CustomerReadTests(PostgresContainerFixture fixture) : CustomerTestBase(fixture)
{
    [Fact]
    public async Task GetById_AsOwner_ReturnsCustomer()
    {
        var (_, token) = await CreateUserWithTokenAsync("read-owner@example.com");
        var created = await CreateCustomerAsync(
            token,
            name: "Readable Customer",
            email: "read@acme.com",
            phone: "+905551112233",
            address: "Ankara, Turkey",
            taxNumber: "1234567890");

        using var response = await SendWithTokenAsync(
            HttpMethod.Get,
            $"/api/customers/{created.Id}",
            token);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<CustomerResponse>();

        Assert.NotNull(payload);
        Assert.Equal(created.Id, payload.Id);
        Assert.Equal("Readable Customer", payload.Name);
        Assert.Equal("read@acme.com", payload.Email);
        Assert.Equal("+905551112233", payload.Phone);
        Assert.Equal("Ankara, Turkey", payload.Address);
        Assert.Equal("1234567890", payload.TaxNumber);
    }

    [Fact]
    public async Task GetById_ForAnotherUsersCustomer_ReturnsNotFoundWithoutDisclosure()
    {
        var (_, ownerToken) = await CreateUserWithTokenAsync("read-owner-a@example.com");
        var (_, otherToken) = await CreateUserWithTokenAsync("read-owner-b@example.com");
        var created = await CreateCustomerAsync(ownerToken, name: "Private Customer");

        using var inaccessible = await SendWithTokenAsync(
            HttpMethod.Get,
            $"/api/customers/{created.Id}",
            otherToken);
        using var nonexistent = await SendWithTokenAsync(
            HttpMethod.Get,
            $"/api/customers/{Guid.NewGuid()}",
            otherToken);

        Assert.Equal(HttpStatusCode.NotFound, inaccessible.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, nonexistent.StatusCode);

        var inaccessibleProblem = await ReadProblemAsync(inaccessible);
        var nonexistentProblem = await ReadProblemAsync(nonexistent);

        Assert.Equal(nonexistentProblem.Status, inaccessibleProblem.Status);
        Assert.Equal(nonexistentProblem.Title, inaccessibleProblem.Title);
        Assert.Equal(nonexistentProblem.Detail, inaccessibleProblem.Detail);
    }

    [Fact]
    public async Task GetById_AsAdmin_CanReadAnyCustomer()
    {
        var (_, ownerToken) = await CreateUserWithTokenAsync("admin-read-owner@example.com");
        var (_, adminToken) = await CreateUserWithTokenAsync("admin-reader@example.com", AuthRoles.Admin);
        var created = await CreateCustomerAsync(ownerToken, name: "Admin Readable");

        using var response = await SendWithTokenAsync(
            HttpMethod.Get,
            $"/api/customers/{created.Id}",
            adminToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<CustomerResponse>();

        Assert.NotNull(payload);
        Assert.Equal(created.Id, payload.Id);
    }

    [Fact]
    public async Task GetById_ForNonexistentCustomer_ReturnsNotFound()
    {
        var (_, token) = await CreateUserWithTokenAsync("read-missing@example.com");

        using var response = await SendWithTokenAsync(
            HttpMethod.Get,
            $"/api/customers/{Guid.NewGuid()}",
            token);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var problem = await ReadProblemAsync(response);

        Assert.Equal((int)HttpStatusCode.NotFound, problem.Status);
    }

    [Fact]
    public async Task GetById_DoesNotExposeInternalFields()
    {
        var (_, token) = await CreateUserWithTokenAsync("read-fields@example.com");
        var created = await CreateCustomerAsync(token, name: "Field Check");

        using var response = await SendWithTokenAsync(
            HttpMethod.Get,
            $"/api/customers/{created.Id}",
            token);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var keys = document.RootElement
            .EnumerateObject()
            .Select(property => property.Name)
            .OrderBy(name => name, StringComparer.Ordinal)
            .ToArray();

        Assert.Equal(ExpectedResponseKeys, keys);

        Assert.DoesNotContain("ownerId", keys);
        Assert.DoesNotContain("passwordHash", keys);
        Assert.DoesNotContain("securityStamp", keys);
    }

    private static readonly string[] ExpectedResponseKeys =
    [
        "address",
        "createdAt",
        "email",
        "id",
        "name",
        "phone",
        "taxNumber",
        "updatedAt",
    ];
}
