using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace InvoiceFlow.Api.Features.Auth;

/// <summary>
/// Minimal accessor for the authenticated user. The user id always comes from the
/// validated JWT <c>sub</c> claim, never from request data.
/// </summary>
public interface ICurrentUser
{
    bool IsAuthenticated { get; }

    Guid? UserId { get; }
}

public sealed class CurrentUser(IHttpContextAccessor httpContextAccessor) : ICurrentUser
{
    public bool IsAuthenticated =>
        httpContextAccessor.HttpContext?.User.Identity?.IsAuthenticated == true;

    public Guid? UserId
    {
        get
        {
            var principal = httpContextAccessor.HttpContext?.User;

            if (principal?.Identity?.IsAuthenticated != true)
            {
                return null;
            }

            var subject = principal.FindFirstValue(JwtRegisteredClaimNames.Sub);

            return Guid.TryParse(subject, out var userId) ? userId : null;
        }
    }
}
