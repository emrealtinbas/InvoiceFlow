using InvoiceFlow.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InvoiceFlow.Api.Features.Auth;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(
    UserManager<ApplicationUser> userManager,
    RoleManager<IdentityRole<Guid>> roleManager,
    SignInManager<ApplicationUser> signInManager,
    JwtTokenService tokenService,
    AppDbContext dbContext,
    ICurrentUser currentUser) : ControllerBase
{
    /// <summary>Registers a new user with the User role.</summary>
    [HttpPost("register")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(RegisterResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> Register(RegisterRequest request, CancellationToken cancellationToken)
    {
        var email = request.Email.Trim();

        // Fast path for the common duplicate case; Identity also validates uniqueness.
        if (await userManager.FindByEmailAsync(email) is not null)
        {
            return ConflictProblem("An account with this e-mail address already exists.");
        }

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            LockoutEnabled = true,
        };

        var createResult = await userManager.CreateAsync(user, request.Password);

        if (!createResult.Succeeded)
        {
            if (createResult.Errors.Any(error => error.Code == nameof(IdentityErrorDescriber.DuplicateEmail)))
            {
                return ConflictProblem("An account with this e-mail address already exists.");
            }

            return ValidationProblemFromIdentity(createResult);
        }

        var roleResult = await EnsureUserRoleAsync();

        if (!roleResult.Succeeded)
        {
            return ProblemResult(
                StatusCodes.Status500InternalServerError,
                "Server Error",
                "The user account could not be created.");
        }

        var addToRoleResult = await userManager.AddToRoleAsync(user, AuthRoles.User);

        if (!addToRoleResult.Succeeded)
        {
            return ProblemResult(
                StatusCodes.Status500InternalServerError,
                "Server Error",
                "The user account could not be created.");
        }

        await transaction.CommitAsync(cancellationToken);

        return CreatedAtAction(
            nameof(Me),
            routeValues: null,
            new RegisterResponse(user.Id, user.Email!, AuthRoles.User));
    }

    /// <summary>Authenticates a user and returns a signed JWT access token.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var user = await userManager.FindByEmailAsync(request.Email.Trim());

        if (user is null)
        {
            return UnauthorizedProblem("Invalid e-mail or password.");
        }

        // lockoutOnFailure records failed attempts and enforces the configured lockout.
        var signInResult = await signInManager.CheckPasswordSignInAsync(
            user,
            request.Password,
            lockoutOnFailure: true);

        if (!signInResult.Succeeded)
        {
            return UnauthorizedProblem("Invalid e-mail or password.");
        }

        var roles = await userManager.GetRolesAsync(user);
        var token = tokenService.Create(user, roles);

        return Ok(new LoginResponse(token.Value, "Bearer", token.ExpiresInSeconds));
    }

    /// <summary>Returns the authenticated user's identity and roles.</summary>
    [HttpGet("me")]
    [Authorize(Policy = AuthPolicies.AuthenticatedUser)]
    [ProducesResponseType(typeof(MeResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Me()
    {
        var userId = currentUser.UserId;

        if (userId is null)
        {
            return UnauthorizedProblem("Authentication is required to access this resource.");
        }

        var user = await userManager.FindByIdAsync(userId.Value.ToString());

        if (user is null)
        {
            // The token is valid but the account no longer exists.
            return UnauthorizedProblem("Authentication is required to access this resource.");
        }

        var roles = await userManager.GetRolesAsync(user);

        return Ok(new MeResponse(user.Id, user.Email ?? string.Empty, roles.ToArray()));
    }

    private async Task<IdentityResult> EnsureUserRoleAsync()
    {
        if (await roleManager.RoleExistsAsync(AuthRoles.User))
        {
            return IdentityResult.Success;
        }

        var result = await roleManager.CreateAsync(
            new IdentityRole<Guid>(AuthRoles.User) { Id = Guid.NewGuid() });

        // A concurrent registration may have created the role first.
        return result.Succeeded || await roleManager.RoleExistsAsync(AuthRoles.User)
            ? IdentityResult.Success
            : result;
    }

    private ActionResult ValidationProblemFromIdentity(IdentityResult result)
    {
        foreach (var error in result.Errors)
        {
            ModelState.AddModelError(error.Code, error.Description);
        }

        return ValidationProblem(ModelState);
    }

    private static ObjectResult ConflictProblem(string detail) =>
        ProblemResult(StatusCodes.Status409Conflict, "Conflict", detail);

    private static ObjectResult UnauthorizedProblem(string detail) =>
        ProblemResult(StatusCodes.Status401Unauthorized, "Unauthorized", detail);

    private static ObjectResult ProblemResult(int statusCode, string title, string detail) =>
        new(new ProblemDetails
        {
            Status = statusCode,
            Title = title,
            Detail = detail,
        })
        {
            StatusCode = statusCode,
        };
}
