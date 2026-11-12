using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Customers;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.AspNetCore.Mvc;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class CustomerUpdateTests(PostgresContainerFixture fixture) : CustomerTestBase(fixture)
{
    [Fact]
    public async Task Update_AsOwner_ReplacesMutableFields()
    {
        var (_, token) = await CreateUserWithTokenAsync("update-owner@example.com");
        var created = await CreateCustomerAsync(
            token,
            name: "Before Update",
            email: "before@acme.com");

        using var response = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/customers/{created.Id}",
            token,
            new
            {
                name = "After Update",
                email = "after@acme.com",
                phone = "+905559998877",
                address = "Izmir, Turkey",
                taxNumber = "5556667778",
            });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<CustomerResponse>();

        Assert.NotNull(payload);
        Assert.Equal(created.Id, payload.Id);
        Assert.Equal("After Update", payload.Name);
        Assert.Equal("after@acme.com", payload.Email);
        Assert.Equal("+905559998877", payload.Phone);
        Assert.Equal("Izmir, Turkey", payload.Address);
        Assert.Equal("5556667778", payload.TaxNumber);

        var stored = await FindCustomerAsync(created.Id);

        Assert.NotNull(stored);
        Assert.Equal("After Update", stored.Name);
        Assert.Equal("after@acme.com", stored.Email);
    }

    [Fact]
    public async Task Update_ForAnotherUsersCustomer_ReturnsNotFoundAndLeavesDataUnchanged()
    {
        var (_, ownerToken) = await CreateUserWithTokenAsync("update-owner-a@example.com");
        var (_, otherToken) = await CreateUserWithTokenAsync("update-owner-b@example.com");
        var created = await CreateCustomerAsync(ownerToken, name: "Protected Customer");

        using var response = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/customers/{created.Id}",
            otherToken,
            new { name = "Hijacked" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        var stored = await FindCustomerAsync(created.Id);

        Assert.NotNull(stored);
        Assert.Equal("Protected Customer", stored.Name);
    }

    [Fact]
    public async Task Update_AsAdmin_CanUpdateAnyCustomer()
    {
        var (_, ownerToken) = await CreateUserWithTokenAsync("admin-update-owner@example.com");
        var (_, adminToken) = await CreateUserWithTokenAsync("admin-updater@example.com", AuthRoles.Admin);
        var created = await CreateCustomerAsync(ownerToken, name: "Admin Updatable");

        using var response = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/customers/{created.Id}",
            adminToken,
            new { name = "Updated By Admin" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<CustomerResponse>();

        Assert.NotNull(payload);
        Assert.Equal("Updated By Admin", payload.Name);
    }

    [Fact]
    public async Task Update_DoesNotChangeOwnerIdEvenWhenSuppliedInBody()
    {
        var (owner, token) = await CreateUserWithTokenAsync("update-owner-immutable@example.com");
        var (other, _) = await CreateUserWithTokenAsync("update-other-immutable@example.com");
        var created = await CreateCustomerAsync(token, name: "Owner Immutable");

        using var response = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/customers/{created.Id}",
            token,
            new
            {
                name = "Owner Still Immutable",
                ownerId = other.Id,
            });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var stored = await FindCustomerAsync(created.Id);

        Assert.NotNull(stored);
        Assert.Equal(owner.Id, stored.OwnerId);
        Assert.NotEqual(other.Id, stored.OwnerId);
    }

    [Fact]
    public async Task Update_DoesNotChangeCreatedAt()
    {
        var (_, token) = await CreateUserWithTokenAsync("update-created-at@example.com");
        var created = await CreateCustomerAsync(token, name: "Created At Check");

        using var response = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/customers/{created.Id}",
            token,
            new { name = "Created At Still Check" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<CustomerResponse>();

        Assert.NotNull(payload);
        Assert.Equal(created.CreatedAt, payload.CreatedAt);
    }

    [Fact]
    public async Task Update_SetsUpdatedAt()
    {
        var (_, token) = await CreateUserWithTokenAsync("update-updated-at@example.com");
        var created = await CreateCustomerAsync(token, name: "Updated At Check");

        Assert.Null(created.UpdatedAt);

        using var response = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/customers/{created.Id}",
            token,
            new { name = "Updated At Changed" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<CustomerResponse>();

        Assert.NotNull(payload);
        Assert.NotNull(payload.UpdatedAt);
        Assert.True(payload.UpdatedAt >= payload.CreatedAt);

        var stored = await FindCustomerAsync(created.Id);

        Assert.NotNull(stored);
        Assert.NotNull(stored.UpdatedAt);
    }

    [Theory]
    [InlineData("", "valid@acme.com")]
    [InlineData("   ", "valid@acme.com")]
    [InlineData("Valid Name", "not-an-email")]
    public async Task Update_WithInvalidRequest_ReturnsBadRequest(string name, string email)
    {
        var (_, token) = await CreateUserWithTokenAsync($"update-invalid-{Guid.NewGuid():N}@example.com");
        var created = await CreateCustomerAsync(token, name: "Valid Customer");

        using var response = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/customers/{created.Id}",
            token,
            new { name, email });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();

        Assert.NotNull(problem);
        Assert.NotEmpty(problem.Errors);
    }

    [Fact]
    public async Task Update_WithDuplicateEmailForSameOwner_ReturnsConflict()
    {
        var (_, token) = await CreateUserWithTokenAsync("update-duplicate@example.com");
        await CreateCustomerAsync(token, name: "First", email: "first@acme.com");
        var second = await CreateCustomerAsync(token, name: "Second", email: "second@acme.com");

        using var response = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/customers/{second.Id}",
            token,
            new { name = "Second", email = "first@acme.com" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        var problem = await ReadProblemAsync(response);

        Assert.Equal((int)HttpStatusCode.Conflict, problem.Status);
    }
}
