namespace InvoiceFlow.Api.Features.Auth;

/// <summary>
/// Role names used by the application. Roles are stored by ASP.NET Core Identity.
/// </summary>
public static class AuthRoles
{
    public const string Admin = "Admin";

    public const string User = "User";
}

/// <summary>
/// Authorization policy names. Policies are registered in the composition root.
/// </summary>
public static class AuthPolicies
{
    public const string AdminOnly = "AdminOnly";

    public const string AuthenticatedUser = "AuthenticatedUser";
}
