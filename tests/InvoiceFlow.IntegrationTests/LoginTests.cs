using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class LoginTests(PostgresContainerFixture fixture) : AuthTestBase(fixture)
{
    [Fact]
    public async Task Login_WithValidCredentials_ReturnsJwt()
    {
        const string email = "login@example.com";

        var registered = await RegisterAsync(email);
        var login = await LoginAsync(email);

        Assert.False(string.IsNullOrWhiteSpace(login.AccessToken));
        Assert.Equal("Bearer", login.TokenType);
        Assert.Equal(TestJwt.AccessTokenMinutes * 60, login.ExpiresIn);

        var token = DecodeToken(login.AccessToken);

        Assert.Equal(
            registered.Id.ToString(),
            token.Claims.Single(claim => claim.Type == JwtRegisteredClaimNames.Sub).Value);
        Assert.Equal(
            email,
            token.Claims.Single(claim => claim.Type == JwtRegisteredClaimNames.Email).Value);
        Assert.Contains(token.Claims, claim => claim.Type == "role" && claim.Value == AuthRoles.User);
    }

    [Fact]
    public async Task Login_WithWrongPassword_ReturnsUnauthorized()
    {
        const string email = "wrong-password@example.com";
        await RegisterAsync(email);

        using var response = await PostLoginAsync(new LoginRequest
        {
            Email = email,
            Password = "WrongPass123!",
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Login_WithUnknownEmail_ReturnsUnauthorized()
    {
        using var response = await PostLoginAsync(new LoginRequest
        {
            Email = "unknown@example.com",
            Password = StrongPassword,
        });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Login_DoesNotRevealAccountExistence()
    {
        const string email = "known@example.com";
        await RegisterAsync(email);

        using var wrongPassword = await PostLoginAsync(new LoginRequest
        {
            Email = email,
            Password = "WrongPass123!",
        });

        using var unknownEmail = await PostLoginAsync(new LoginRequest
        {
            Email = "does-not-exist@example.com",
            Password = StrongPassword,
        });

        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknownEmail.StatusCode);

        var wrongPasswordBody = await wrongPassword.Content.ReadAsStringAsync();
        var unknownEmailBody = await unknownEmail.Content.ReadAsStringAsync();

        Assert.Equal(wrongPasswordBody, unknownEmailBody);

        var problem = await unknownEmail.Content.ReadFromJsonAsync<ProblemDetails>();

        Assert.NotNull(problem);
        Assert.Equal((int)HttpStatusCode.Unauthorized, problem.Status);
        Assert.Equal("Unauthorized", problem.Title);
    }

    [Fact]
    public async Task Login_LocksOutAfterFiveFailedAttempts()
    {
        const string email = "lockout@example.com";
        await RegisterAsync(email);

        for (var attempt = 0; attempt < 5; attempt++)
        {
            using var failed = await PostLoginAsync(new LoginRequest
            {
                Email = email,
                Password = "WrongPass123!",
            });

            Assert.Equal(HttpStatusCode.Unauthorized, failed.StatusCode);
        }

        // Even the correct password is rejected while the account is locked.
        using var locked = await PostLoginAsync(new LoginRequest
        {
            Email = email,
            Password = StrongPassword,
        });

        Assert.Equal(HttpStatusCode.Unauthorized, locked.StatusCode);

        using var scope = Factory.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await userManager.FindByEmailAsync(email);

        Assert.NotNull(user);
        Assert.True(await userManager.IsLockedOutAsync(user));

        var lockoutEnd = await userManager.GetLockoutEndDateAsync(user);

        Assert.NotNull(lockoutEnd);
        Assert.True(lockoutEnd > DateTimeOffset.UtcNow);
        Assert.True(lockoutEnd <= DateTimeOffset.UtcNow.AddMinutes(16));
    }

    [Fact]
    public async Task Login_TokenRespectsConfiguredLifetime()
    {
        const string email = "lifetime@example.com";
        await RegisterAsync(email);

        var login = await LoginAsync(email);
        var token = DecodeToken(login.AccessToken);

        Assert.Equal(TestJwt.AccessTokenMinutes * 60, login.ExpiresIn);
        Assert.Equal(
            TimeSpan.FromMinutes(TestJwt.AccessTokenMinutes),
            token.ValidTo - token.ValidFrom);
    }
}
