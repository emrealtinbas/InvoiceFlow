using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.IntegrationTests.Persistence;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class AuthorizationTests(PostgresContainerFixture fixture) : AuthTestBase(fixture)
{
    [Fact]
    public async Task User_CannotAccessAdminOnlyPolicy()
    {
        const string email = "regular-user@example.com";
        await RegisterAsync(email);
        var login = await LoginAsync(email);

        using var response = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/test/authorization/admin",
            login.AccessToken);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Admin_CanAccessAdminOnlyPolicy()
    {
        const string email = "admin@example.com";
        await CreateUserAsync(email, StrongPassword, AuthRoles.Admin);
        var login = await LoginAsync(email);

        using var response = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/test/authorization/admin",
            login.AccessToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task AuthenticatedUserPolicy_AcceptsValidUser()
    {
        const string email = "authenticated@example.com";
        await RegisterAsync(email);
        var login = await LoginAsync(email);

        using var response = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/test/authorization/authenticated",
            login.AccessToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Me_ReturnsAuthenticatedUser()
    {
        const string email = "me@example.com";
        var registered = await RegisterAsync(email);
        var login = await LoginAsync(email);

        using var response = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/auth/me",
            login.AccessToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var me = await response.Content.ReadFromJsonAsync<MeResponse>();

        Assert.NotNull(me);
        Assert.Equal(registered.Id, me.Id);
        Assert.Equal(email, me.Email);
        Assert.Equal(new[] { AuthRoles.User }, me.Roles);
    }

    [Fact]
    public async Task Me_WithoutToken_ReturnsUnauthorized()
    {
        using var response = await Client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Me_ForDeletedUser_ReturnsUnauthorized()
    {
        const string email = "deleted@example.com";
        var registered = await RegisterAsync(email);
        var login = await LoginAsync(email);

        await DeleteUserAsync(registered.Id);

        using var response = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/auth/me",
            login.AccessToken);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
