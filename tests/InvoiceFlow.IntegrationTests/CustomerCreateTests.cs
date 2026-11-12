using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Customers;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.AspNetCore.Mvc;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class CustomerCreateTests(PostgresContainerFixture fixture) : CustomerTestBase(fixture)
{
    [Fact]
    public async Task Create_WithValidRequest_ReturnsCreatedAndPersistsNormalizedValues()
    {
        var (owner, token) = await CreateUserWithTokenAsync("create-owner@example.com");

        using var response = await SendJsonAsync(HttpMethod.Post, "/api/customers", token, new
        {
            name = "  Acme Corporation  ",
            email = "  Billing@Acme.com  ",
            phone = "  +905551234567  ",
            address = "  Istanbul, Turkey  ",
            taxNumber = "  1234567890  ",
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<CustomerResponse>();

        Assert.NotNull(payload);
        Assert.Equal("Acme Corporation", payload.Name);
        Assert.Equal("billing@acme.com", payload.Email);
        Assert.Equal("+905551234567", payload.Phone);
        Assert.Equal("Istanbul, Turkey", payload.Address);
        Assert.Equal("1234567890", payload.TaxNumber);
        Assert.Null(payload.UpdatedAt);

        var stored = await FindCustomerAsync(payload.Id);

        Assert.NotNull(stored);
        Assert.Equal(owner.Id, stored.OwnerId);
        Assert.Equal("billing@acme.com", stored.Email);
    }

    [Fact]
    public async Task Create_WithoutAuthentication_ReturnsUnauthorizedProblemDetails()
    {
        using var response = await Client.PostAsJsonAsync("/api/customers", new { name = "Acme" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Create_UsesOwnerFromJwtAndIgnoresOwnerIdInBody()
    {
        var (owner, token) = await CreateUserWithTokenAsync("jwt-owner@example.com");
        var (other, _) = await CreateUserWithTokenAsync("body-owner@example.com");

        using var response = await SendJsonAsync(HttpMethod.Post, "/api/customers", token, new
        {
            name = "Owner Check",
            ownerId = other.Id,
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<CustomerResponse>();

        Assert.NotNull(payload);

        var stored = await FindCustomerAsync(payload.Id);

        Assert.NotNull(stored);
        Assert.Equal(owner.Id, stored.OwnerId);
        Assert.NotEqual(other.Id, stored.OwnerId);
    }

    [Theory]
    [InlineData("")]
    [InlineData("A")]
    [InlineData("   ")]
    public async Task Create_WithInvalidName_ReturnsBadRequest(string name)
    {
        var (_, token) = await CreateUserWithTokenAsync($"invalid-name-{Guid.NewGuid():N}@example.com");

        using var response = await SendJsonAsync(HttpMethod.Post, "/api/customers", token, new { name });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();

        Assert.NotNull(problem);
        Assert.Contains("Name", problem.Errors.Keys);
    }

    [Fact]
    public async Task Create_WithInvalidEmail_ReturnsBadRequest()
    {
        var (_, token) = await CreateUserWithTokenAsync("invalid-email@example.com");

        using var response = await SendJsonAsync(HttpMethod.Post, "/api/customers", token, new
        {
            name = "Acme",
            email = "not-an-email",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();

        Assert.NotNull(problem);
        Assert.Contains("Email", problem.Errors.Keys);
    }

    [Theory]
    [InlineData("555-ABC")]
    [InlineData("12/34")]
    public async Task Create_WithInvalidPhone_ReturnsBadRequest(string phone)
    {
        var (_, token) = await CreateUserWithTokenAsync($"invalid-phone-{Guid.NewGuid():N}@example.com");

        using var response = await SendJsonAsync(HttpMethod.Post, "/api/customers", token, new
        {
            name = "Acme",
            phone,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();

        Assert.NotNull(problem);
        Assert.Contains("Phone", problem.Errors.Keys);
    }

    [Theory]
    [InlineData("123456789")]
    [InlineData("123456789012")]
    [InlineData("123456789A")]
    public async Task Create_WithInvalidTaxNumber_ReturnsBadRequest(string taxNumber)
    {
        var (_, token) = await CreateUserWithTokenAsync($"invalid-tax-{Guid.NewGuid():N}@example.com");

        using var response = await SendJsonAsync(HttpMethod.Post, "/api/customers", token, new
        {
            name = "Acme",
            taxNumber,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();

        Assert.NotNull(problem);
        Assert.Contains("TaxNumber", problem.Errors.Keys);
    }

    [Fact]
    public async Task Create_WithDuplicateEmailForSameOwner_ReturnsConflict()
    {
        var (_, token) = await CreateUserWithTokenAsync("duplicate-owner@example.com");

        await CreateCustomerAsync(token, email: "billing@acme.com");

        using var response = await SendJsonAsync(HttpMethod.Post, "/api/customers", token, new
        {
            name = "Second Customer",
            email = "billing@acme.com",
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        var problem = await ReadProblemAsync(response);

        Assert.Equal((int)HttpStatusCode.Conflict, problem.Status);
    }

    [Fact]
    public async Task Create_WithSameEmailForDifferentOwners_IsAllowed()
    {
        var (_, firstToken) = await CreateUserWithTokenAsync("owner-one@example.com");
        var (_, secondToken) = await CreateUserWithTokenAsync("owner-two@example.com");

        using var first = await SendJsonAsync(HttpMethod.Post, "/api/customers", firstToken, new
        {
            name = "First Owner Customer",
            email = "shared@acme.com",
        });

        using var second = await SendJsonAsync(HttpMethod.Post, "/api/customers", secondToken, new
        {
            name = "Second Owner Customer",
            email = "shared@acme.com",
        });

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
    }

    [Fact]
    public async Task Create_WithCaseInsensitiveDuplicateEmail_ReturnsConflict()
    {
        var (_, token) = await CreateUserWithTokenAsync("case-owner@example.com");

        await CreateCustomerAsync(token, email: "billing@acme.com");

        using var response = await SendJsonAsync(HttpMethod.Post, "/api/customers", token, new
        {
            name = "Case Variant",
            email = "Billing@Acme.COM",
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Create_WithNullEmail_AllowsMultipleCustomers()
    {
        var (_, token) = await CreateUserWithTokenAsync("null-email@example.com");

        using var first = await SendJsonAsync(HttpMethod.Post, "/api/customers", token, new
        {
            name = "First Without Email",
            email = (string?)null,
        });

        using var second = await SendJsonAsync(HttpMethod.Post, "/api/customers", token, new
        {
            name = "Second Without Email",
            email = "   ",
        });

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
    }

    [Fact]
    public async Task Create_ReturnsLocationHeaderPointingToTheNewCustomer()
    {
        var (_, token) = await CreateUserWithTokenAsync("location@example.com");

        using var response = await SendJsonAsync(HttpMethod.Post, "/api/customers", token, new
        {
            name = "Location Co",
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(response.Headers.Location);

        var payload = await response.Content.ReadFromJsonAsync<CustomerResponse>();

        Assert.NotNull(payload);
        Assert.EndsWith(
            $"/api/customers/{payload.Id}",
            response.Headers.Location!.ToString(),
            StringComparison.Ordinal);

        using var get = await SendWithTokenAsync(
            HttpMethod.Get,
            response.Headers.Location!.ToString(),
            token);

        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
    }
}
