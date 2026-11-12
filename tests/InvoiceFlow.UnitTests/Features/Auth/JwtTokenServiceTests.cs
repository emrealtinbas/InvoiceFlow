using System.IdentityModel.Tokens.Jwt;
using InvoiceFlow.Api.Features.Auth;
using Microsoft.Extensions.Options;

namespace InvoiceFlow.UnitTests.Features.Auth;

public sealed class JwtTokenServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 1, 15, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Create_IncludesExpectedClaims()
    {
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            Email = "user@example.com",
        };

        var token = CreateService().Create(user, new[] { AuthRoles.User });
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token.Value);

        Assert.Equal(
            user.Id.ToString(),
            jwt.Claims.Single(claim => claim.Type == JwtRegisteredClaimNames.Sub).Value);
        Assert.Equal(
            user.Email,
            jwt.Claims.Single(claim => claim.Type == JwtRegisteredClaimNames.Email).Value);
        Assert.Equal("InvoiceFlow", jwt.Issuer);
        Assert.Contains("InvoiceFlow.Api", jwt.Audiences);
        Assert.Equal(Now.UtcDateTime, jwt.ValidFrom);
        Assert.Equal(Now.AddMinutes(30).UtcDateTime, jwt.ValidTo);
        Assert.False(string.IsNullOrWhiteSpace(jwt.Payload.Jti));
        Assert.Contains(jwt.Claims, claim => claim.Type == "role" && claim.Value == AuthRoles.User);
    }

    [Fact]
    public void Create_ReturnsConfiguredLifetime()
    {
        var user = new ApplicationUser { Id = Guid.NewGuid(), Email = "user@example.com" };

        var token = CreateService(accessTokenMinutes: 45).Create(user, Array.Empty<string>());

        Assert.Equal(45 * 60, token.ExpiresInSeconds);
        Assert.Equal(Now.AddMinutes(45), token.ExpiresAt);
    }

    [Fact]
    public void Create_WithMultipleRoles_AddsEveryRoleClaim()
    {
        var user = new ApplicationUser { Id = Guid.NewGuid(), Email = "admin@example.com" };

        var token = CreateService().Create(user, new[] { AuthRoles.Admin, AuthRoles.User });
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token.Value);

        var roles = jwt.Claims
            .Where(claim => claim.Type == "role")
            .Select(claim => claim.Value)
            .ToArray();

        Assert.Equal(new[] { AuthRoles.Admin, AuthRoles.User }, roles);
    }

    private static JwtTokenService CreateService(int accessTokenMinutes = 30) =>
        new(
            Options.Create(new JwtOptions
            {
                Issuer = "InvoiceFlow",
                Audience = "InvoiceFlow.Api",
                AccessTokenMinutes = accessTokenMinutes,
                SigningKey = new string('k', JwtOptions.MinimumSigningKeyBytes),
            }),
            new FixedTimeProvider(Now));

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
