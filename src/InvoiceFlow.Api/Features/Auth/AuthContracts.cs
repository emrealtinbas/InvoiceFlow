using System.ComponentModel.DataAnnotations;

namespace InvoiceFlow.Api.Features.Auth;

public sealed class RegisterRequest
{
    [Required]
    [EmailAddress]
    [StringLength(320)]
    public string Email { get; set; } = string.Empty;

    [Required]
    [StringLength(128, MinimumLength = 1)]
    public string Password { get; set; } = string.Empty;
}

public sealed class LoginRequest
{
    [Required]
    [EmailAddress]
    [StringLength(320)]
    public string Email { get; set; } = string.Empty;

    [Required]
    [StringLength(128, MinimumLength = 1)]
    public string Password { get; set; } = string.Empty;
}

public sealed record RegisterResponse(Guid Id, string Email, string Role);

public sealed record LoginResponse(string AccessToken, string TokenType, int ExpiresIn);

public sealed record MeResponse(Guid Id, string Email, IReadOnlyList<string> Roles);
