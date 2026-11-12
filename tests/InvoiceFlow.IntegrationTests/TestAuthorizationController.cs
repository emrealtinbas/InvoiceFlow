using InvoiceFlow.Api.Features.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InvoiceFlow.IntegrationTests;

/// <summary>
/// Test-only endpoints used to exercise authorization policies. This controller is
/// registered by <see cref="InvoiceFlowApiFactory"/> in the test host only.
/// </summary>
[ApiController]
[Route("api/test/authorization")]
public sealed class TestAuthorizationController : ControllerBase
{
    [HttpGet("admin")]
    [Authorize(Policy = AuthPolicies.AdminOnly)]
    public IActionResult AdminOnly() => Ok(new { message = "admin" });

    [HttpGet("authenticated")]
    [Authorize(Policy = AuthPolicies.AuthenticatedUser)]
    public IActionResult AuthenticatedUser() => Ok(new { message = "authenticated" });

    [HttpGet("throw")]
    [AllowAnonymous]
    public IActionResult Throw()
    {
        // Touch an instance member so the analyzer does not suggest a static action.
        _ = User;

        throw new InvalidOperationException("Sensitive server detail that must not leak.");
    }
}
