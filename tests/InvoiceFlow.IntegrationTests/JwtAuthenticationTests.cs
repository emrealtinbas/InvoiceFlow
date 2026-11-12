using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.IntegrationTests.Persistence;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class JwtAuthenticationTests(PostgresContainerFixture fixture) : AuthTestBase(fixture)
{
    [Fact]
    public async Task ValidJwt_AuthenticatesOnMeEndpoint()
    {
        const string email = "valid-token@example.com";
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
    public async Task MissingJwt_ReturnsUnauthorized()
    {
        using var response = await Client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task InvalidSignature_ReturnsUnauthorized()
    {
        var token = TestJwt.CreateToken(
            Guid.NewGuid(),
            "invalid-signature@example.com",
            new[] { AuthRoles.User },
            signingKey: TestJwt.OtherSigningKey);

        using var response = await SendWithTokenAsync(HttpMethod.Get, "/api/auth/me", token);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ExpiredJwt_ReturnsUnauthorized()
    {
        var now = DateTimeOffset.UtcNow;
        var token = TestJwt.CreateToken(
            Guid.NewGuid(),
            "expired@example.com",
            new[] { AuthRoles.User },
            issuedAt: now.AddMinutes(-10),
            expires: now.AddMinutes(-5));

        using var response = await SendWithTokenAsync(HttpMethod.Get, "/api/auth/me", token);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task InvalidIssuer_ReturnsUnauthorized()
    {
        var token = TestJwt.CreateToken(
            Guid.NewGuid(),
            "invalid-issuer@example.com",
            new[] { AuthRoles.User },
            issuer: "SomeOtherIssuer");

        using var response = await SendWithTokenAsync(HttpMethod.Get, "/api/auth/me", token);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task InvalidAudience_ReturnsUnauthorized()
    {
        var token = TestJwt.CreateToken(
            Guid.NewGuid(),
            "invalid-audience@example.com",
            new[] { AuthRoles.User },
            audience: "SomeOtherAudience");

        using var response = await SendWithTokenAsync(HttpMethod.Get, "/api/auth/me", token);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task UnsignedToken_ReturnsUnauthorized()
    {
        var token = TestJwt.CreateUnsignedToken(
            Guid.NewGuid(),
            "unsigned@example.com",
            new[] { AuthRoles.User });

        using var response = await SendWithTokenAsync(HttpMethod.Get, "/api/auth/me", token);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Jwt_ContainsExpectedIdentityAndRoleClaims()
    {
        const string email = "claims@example.com";
        var registered = await RegisterAsync(email);
        var login = await LoginAsync(email);
        var token = DecodeToken(login.AccessToken);

        Assert.Equal(
            registered.Id.ToString(),
            token.Claims.Single(claim => claim.Type == JwtRegisteredClaimNames.Sub).Value);
        Assert.Equal(
            email,
            token.Claims.Single(claim => claim.Type == JwtRegisteredClaimNames.Email).Value);
        Assert.Equal(TestJwt.Issuer, token.Issuer);
        Assert.Contains(TestJwt.Audience, token.Audiences);
        Assert.Contains(token.Claims, claim => claim.Type == "role" && claim.Value == AuthRoles.User);
        Assert.NotEqual(default, token.Payload.IssuedAt);
        Assert.NotNull(token.Payload.Expiration);
        Assert.NotNull(token.Payload.Jti);
        Assert.False(string.IsNullOrWhiteSpace(token.Payload.Jti));
    }
}
