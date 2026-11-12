using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Infrastructure.Persistence;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class RegistrationTests(PostgresContainerFixture fixture) : AuthTestBase(fixture)
{
    [Fact]
    public async Task Register_WithValidCredentials_CreatesUserWithUserRole()
    {
        const string email = "new-user@example.com";

        var payload = await RegisterAsync(email);

        Assert.NotEqual(Guid.Empty, payload.Id);
        Assert.Equal(email, payload.Email);
        Assert.Equal(AuthRoles.User, payload.Role);

        var user = await FindUserAsync(email);

        Assert.NotNull(user);
        Assert.Equal(payload.Id, user.Id);
        Assert.Equal(email, user.Email);

        var roles = await GetRolesAsync(user.Id);

        Assert.Equal(new[] { AuthRoles.User }, roles);
    }

    [Fact]
    public async Task Register_StoresPasswordAsHash()
    {
        const string email = "hashed@example.com";
        const string password = "AnotherStrong123!";

        var payload = await RegisterAsync(email, password);

        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var stored = await dbContext.Users.SingleAsync(user => user.Id == payload.Id);

        Assert.NotNull(stored.PasswordHash);
        Assert.NotEqual(password, stored.PasswordHash);
        Assert.DoesNotContain(password, stored.PasswordHash, StringComparison.Ordinal);

        // Identity v3 PBKDF2 hashes start with the version marker AQAAAA.
        Assert.StartsWith("AQAAAA", stored.PasswordHash, StringComparison.Ordinal);

        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<ApplicationUser>>();

        Assert.Equal(
            PasswordVerificationResult.Success,
            hasher.VerifyHashedPassword(stored, stored.PasswordHash, password));
    }

    [Fact]
    public async Task Register_AssignsOnlyTheUserRole()
    {
        var payload = await RegisterAsync("only-user@example.com");

        var roles = await GetRolesAsync(payload.Id);

        Assert.Contains(AuthRoles.User, roles);
        Assert.DoesNotContain(AuthRoles.Admin, roles);
        Assert.Single(roles);
    }

    [Fact]
    public async Task Register_WithDuplicateEmail_ReturnsConflict()
    {
        const string email = "duplicate@example.com";

        await RegisterAsync(email);

        using var response = await PostRegisterAsync(new RegisterRequest
        {
            Email = email,
            Password = StrongPassword,
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        Assert.Equal(1, await dbContext.Users.CountAsync(user => user.Email == email));
    }

    [Fact]
    public async Task Register_WithInvalidEmail_ReturnsBadRequest()
    {
        using var response = await PostRegisterAsync(new RegisterRequest
        {
            Email = "not-an-email",
            Password = StrongPassword,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();

        Assert.NotNull(problem);
        Assert.Contains(nameof(RegisterRequest.Email), problem.Errors.Keys);
    }

    [Fact]
    public async Task Register_WithWeakPassword_ReturnsBadRequest()
    {
        using var response = await PostRegisterAsync(new RegisterRequest
        {
            Email = "weak@example.com",
            Password = "short",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();

        Assert.NotNull(problem);
        Assert.NotEmpty(problem.Errors);
    }

    [Fact]
    public async Task Register_IgnoresClientSuppliedRole()
    {
        const string email = "role-injection@example.com";

        using var response = await PostRegisterAsync(new
        {
            email,
            password = StrongPassword,
            role = AuthRoles.Admin,
            roles = new[] { AuthRoles.Admin },
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<RegisterResponse>();

        Assert.NotNull(payload);
        Assert.Equal(AuthRoles.User, payload.Role);

        var roles = await GetRolesAsync(payload.Id);

        Assert.DoesNotContain(AuthRoles.Admin, roles);
        Assert.Equal(new[] { AuthRoles.User }, roles);
    }

    [Fact]
    public async Task Register_WhenRoleAssignmentFails_DoesNotLeavePartialUser()
    {
        const string email = "partial@example.com";

        await using var failingFactory = new InvoiceFlowApiFactory(
            Fixture.ConnectionString,
            failRoleAssignment: true);
        using var failingClient = failingFactory.CreateClient();

        using var response = await failingClient.PostAsJsonAsync("/api/auth/register", new RegisterRequest
        {
            Email = email,
            Password = StrongPassword,
        });

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);

        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        Assert.False(await dbContext.Users.AnyAsync(user => user.Email == email));
    }
}
