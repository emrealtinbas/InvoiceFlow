using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using InvoiceFlow.Api.Features.Auth;
using Microsoft.AspNetCore.Http;

namespace InvoiceFlow.UnitTests.Features.Auth;

public sealed class CurrentUserTests
{
    [Fact]
    public void UserId_ReturnsGuidFromSubClaim()
    {
        var userId = Guid.NewGuid();
        var currentUser = CreateCurrentUser(
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()));

        Assert.True(currentUser.IsAuthenticated);
        Assert.Equal(userId, currentUser.UserId);
    }

    [Fact]
    public void UserId_ReturnsNull_WhenUnauthenticated()
    {
        var accessor = new HttpContextAccessor { HttpContext = new DefaultHttpContext() };
        var currentUser = new CurrentUser(accessor);

        Assert.False(currentUser.IsAuthenticated);
        Assert.Null(currentUser.UserId);
    }

    [Fact]
    public void UserId_ReturnsNull_WhenSubClaimIsMissing()
    {
        var currentUser = CreateCurrentUser(
            new Claim(JwtRegisteredClaimNames.Email, "user@example.com"));

        Assert.Null(currentUser.UserId);
    }

    [Fact]
    public void UserId_ReturnsNull_WhenSubClaimIsNotAGuid()
    {
        var currentUser = CreateCurrentUser(
            new Claim(JwtRegisteredClaimNames.Sub, "not-a-guid"));

        Assert.Null(currentUser.UserId);
    }

    private static CurrentUser CreateCurrentUser(params Claim[] claims)
    {
        var identity = new ClaimsIdentity(claims, authenticationType: "Test");
        var context = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(identity),
        };
        var accessor = new HttpContextAccessor { HttpContext = context };

        return new CurrentUser(accessor);
    }
}
