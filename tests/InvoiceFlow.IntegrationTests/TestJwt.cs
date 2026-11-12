using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.IdentityModel.Tokens;

namespace InvoiceFlow.IntegrationTests;

/// <summary>
/// Test-only JWT values and token factories. The signing key is deliberately not
/// the production key and is only used by the test host.
/// </summary>
internal static class TestJwt
{
    public const string SigningKey =
        "integration-test-signing-key-0123456789-abcdefghijklmnopqrstuvwxyz";

    public const string OtherSigningKey =
        "other-integration-test-signing-key-9876543210-zyxwvutsrqponmlkjihgfedcba";

    public const string Issuer = "InvoiceFlow.Tests";

    public const string Audience = "InvoiceFlow.Api.Tests";

    public const int AccessTokenMinutes = 30;

    public static string CreateToken(
        Guid userId,
        string email,
        IEnumerable<string> roles,
        string signingKey = SigningKey,
        string issuer = Issuer,
        string audience = Audience,
        DateTimeOffset? issuedAt = null,
        DateTimeOffset? expires = null)
    {
        var now = issuedAt ?? DateTimeOffset.UtcNow;
        var expiration = expires ?? now.AddMinutes(AccessTokenMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new(JwtRegisteredClaimNames.Email, email),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };

        foreach (var role in roles)
        {
            claims.Add(new Claim("role", role));
        }

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey));
        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: expiration.UtcDateTime,
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>Builds a structurally valid token with the <c>none</c> algorithm.</summary>
    public static string CreateUnsignedToken(Guid userId, string email, IEnumerable<string> roles)
    {
        var now = DateTimeOffset.UtcNow;

        var header = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(new
        {
            alg = "none",
            typ = "JWT",
        }));

        var payload = Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(new Dictionary<string, object?>
        {
            ["sub"] = userId.ToString(),
            ["email"] = email,
            ["role"] = roles.ToArray(),
            ["iss"] = Issuer,
            ["aud"] = Audience,
            ["iat"] = now.ToUnixTimeSeconds(),
            ["exp"] = now.AddMinutes(AccessTokenMinutes).ToUnixTimeSeconds(),
            ["jti"] = Guid.NewGuid().ToString("N", CultureInfo.InvariantCulture),
        }));

        return $"{header}.{payload}.";
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
}
