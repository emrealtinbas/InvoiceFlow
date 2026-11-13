using Microsoft.Extensions.Primitives;

namespace InvoiceFlow.Api.Infrastructure.Observability;

/// <summary>
/// Establishes exactly one correlation identifier per request. A safe client-supplied
/// <c>X-Correlation-ID</c> value is preserved; anything missing, too long, or containing
/// unexpected characters is replaced with a generated identifier.
/// </summary>
public sealed class CorrelationIdMiddleware(
    RequestDelegate next,
    ILogger<CorrelationIdMiddleware> logger)
{
    public const string HeaderName = "X-Correlation-ID";
    public const int MaximumLength = 128;
    public const string ItemKey = "InvoiceFlow.CorrelationId";

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = Resolve(context.Request.Headers[HeaderName]);

        context.Items[ItemKey] = correlationId;
        context.TraceIdentifier = correlationId;
        context.Response.Headers[HeaderName] = correlationId;

        using (logger.BeginScope("CorrelationId:{CorrelationId}", correlationId))
        {
            await next(context);
        }
    }

    /// <summary>Returns the supplied value when it is safe, otherwise a new identifier.</summary>
    public static string Resolve(StringValues values)
    {
        var candidate = values.Count == 1 ? values[0] : null;

        return IsValid(candidate) ? candidate! : Guid.NewGuid().ToString("N");
    }

    /// <summary>
    /// Accepts only a bounded, printable ASCII token. Control characters, whitespace,
    /// and arbitrary header content are rejected rather than echoed back.
    /// </summary>
    public static bool IsValid(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Length > MaximumLength)
        {
            return false;
        }

        foreach (var character in value)
        {
            if (!IsAllowed(character))
            {
                return false;
            }
        }

        return true;
    }

    private static bool IsAllowed(char character) =>
        char.IsAsciiLetterOrDigit(character) || character is '-' or '_' or '.' or ':';
}

public static class CorrelationIdHttpContextExtensions
{
    /// <summary>
    /// Returns the correlation identifier established for the request. Falls back to the
    /// framework trace identifier when the middleware has not run (for example in unit tests).
    /// </summary>
    public static string GetCorrelationId(this HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        return context.Items.TryGetValue(CorrelationIdMiddleware.ItemKey, out var value) &&
            value is string correlationId
                ? correlationId
                : context.TraceIdentifier;
    }
}
