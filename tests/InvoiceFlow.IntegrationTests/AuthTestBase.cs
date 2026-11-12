using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace InvoiceFlow.IntegrationTests;

/// <summary>
/// Shared setup for authentication integration tests: a real PostgreSQL database,
/// a real HTTP pipeline, and helpers for creating users and tokens.
/// </summary>
public abstract class AuthTestBase : IAsyncLifetime
{
    protected const string StrongPassword = "StrongPass123!";

    protected AuthTestBase(PostgresContainerFixture fixture)
    {
        Fixture = fixture;
        Factory = new InvoiceFlowApiFactory(fixture.ConnectionString);
        Client = Factory.CreateClient();
    }

    protected PostgresContainerFixture Fixture { get; }

    protected InvoiceFlowApiFactory Factory { get; }

    protected HttpClient Client { get; }

    public virtual Task InitializeAsync() => Fixture.ResetDatabaseAsync();

    public virtual async Task DisposeAsync()
    {
        Client.Dispose();
        await Factory.DisposeAsync();
    }

    protected Task<HttpResponseMessage> PostRegisterAsync(object body) =>
        Client.PostAsJsonAsync("/api/auth/register", body);

    protected Task<HttpResponseMessage> PostLoginAsync(object body) =>
        Client.PostAsJsonAsync("/api/auth/login", body);

    protected async Task<RegisterResponse> RegisterAsync(
        string email = "user@example.com",
        string password = StrongPassword)
    {
        using var response = await PostRegisterAsync(new RegisterRequest
        {
            Email = email,
            Password = password,
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<RegisterResponse>();

        Assert.NotNull(payload);
        return payload;
    }

    protected async Task<LoginResponse> LoginAsync(
        string email = "user@example.com",
        string password = StrongPassword)
    {
        using var response = await PostLoginAsync(new LoginRequest
        {
            Email = email,
            Password = password,
        });

        response.EnsureSuccessStatusCode();

        var payload = await response.Content.ReadFromJsonAsync<LoginResponse>();

        Assert.NotNull(payload);
        return payload;
    }

    protected async Task<ApplicationUser> CreateUserAsync(
        string email,
        string password = StrongPassword,
        string? role = null)
    {
        using var scope = Factory.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        if (role is not null)
        {
            var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();

            if (!await roleManager.RoleExistsAsync(role))
            {
                var roleResult = await roleManager.CreateAsync(
                    new IdentityRole<Guid>(role) { Id = Guid.NewGuid() });

                Assert.True(roleResult.Succeeded);
            }
        }

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            LockoutEnabled = true,
        };

        var createResult = await userManager.CreateAsync(user, password);

        Assert.True(
            createResult.Succeeded,
            string.Join("; ", createResult.Errors.Select(error => error.Description)));

        if (role is not null)
        {
            var addRoleResult = await userManager.AddToRoleAsync(user, role);

            Assert.True(
                addRoleResult.Succeeded,
                string.Join("; ", addRoleResult.Errors.Select(error => error.Description)));
        }

        return user;
    }

    protected async Task<ApplicationUser?> FindUserAsync(string email)
    {
        using var scope = Factory.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();

        return await userManager.FindByEmailAsync(email);
    }

    protected async Task<IList<string>> GetRolesAsync(Guid userId)
    {
        using var scope = Factory.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await userManager.FindByIdAsync(userId.ToString());

        Assert.NotNull(user);
        return await userManager.GetRolesAsync(user);
    }

    protected async Task DeleteUserAsync(Guid userId)
    {
        using var scope = Factory.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await userManager.FindByIdAsync(userId.ToString());

        Assert.NotNull(user);

        var result = await userManager.DeleteAsync(user);
        Assert.True(result.Succeeded);
    }

    protected async Task<HttpResponseMessage> SendWithTokenAsync(
        HttpMethod method,
        string url,
        string token)
    {
        using var request = new HttpRequestMessage(method, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        return await Client.SendAsync(request);
    }

    protected static JwtSecurityToken DecodeToken(string token) =>
        new JwtSecurityTokenHandler().ReadJwtToken(token);
}
