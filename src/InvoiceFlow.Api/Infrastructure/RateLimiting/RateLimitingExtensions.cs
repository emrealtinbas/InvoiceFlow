using System.Globalization;
using System.Threading.RateLimiting;
using InvoiceFlow.Api.Infrastructure.Observability;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace InvoiceFlow.Api.Infrastructure.RateLimiting;

public static class RateLimitingPolicies
{
    public const string Login = "login";
    public const string Register = "register";
}

/// <summary>
/// Native ASP.NET Core fixed-window rate limiting for the credential endpoints.
/// Limiting is per process instance and in memory; it is a defensive control, not a
/// distributed security boundary.
/// </summary>
public static class RateLimitingExtensions
{
    private const string ProblemDetailsContentType = "application/problem+json";

    public static IServiceCollection AddInvoiceFlowRateLimiting(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var loginPermitLimit = Math.Max(
            1,
            configuration.GetValue("RateLimiting:Login:PermitLimit", 10));
        var registerPermitLimit = Math.Max(
            1,
            configuration.GetValue("RateLimiting:Register:PermitLimit", 5));
        var windowMinutes = configuration.GetValue("RateLimiting:WindowMinutes", 1);
        var window = TimeSpan.FromMinutes(windowMinutes > 0 ? windowMinutes : 1);

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            options.AddPolicy(
                RateLimitingPolicies.Login,
                context => CreatePartition(context, loginPermitLimit, window));

            options.AddPolicy(
                RateLimitingPolicies.Register,
                context => CreatePartition(context, registerPermitLimit, window));

            options.OnRejected = WriteRejectedAsync;
        });

        return services;
    }

    /// <summary>
    /// Partitions by the direct connection address. <c>X-Forwarded-For</c> is not read
    /// here; it is only honored after <c>ForwardedHeaders</c> has validated the request
    /// against explicitly configured trusted proxies.
    /// </summary>
    public static string ResolvePartitionKey(HttpContext context)
    {
        var address = context.Connection.RemoteIpAddress;

        return address is null ? "unknown-client" : address.ToString();
    }

    private static RateLimitPartition<string> CreatePartition(
        HttpContext context,
        int permitLimit,
        TimeSpan window) =>
        RateLimitPartition.GetFixedWindowLimiter(
            ResolvePartitionKey(context),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = permitLimit,
                Window = window,
                QueueLimit = 0,
                AutoReplenishment = true,
            });

    private static async ValueTask WriteRejectedAsync(
        OnRejectedContext context,
        CancellationToken cancellationToken)
    {
        var httpContext = context.HttpContext;

        if (httpContext.Response.HasStarted)
        {
            return;
        }

        httpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;

        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            httpContext.Response.Headers.RetryAfter = Math
                .Ceiling(retryAfter.TotalSeconds)
                .ToString(CultureInfo.InvariantCulture);
        }

        var correlationId = httpContext.GetCorrelationId();
        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status429TooManyRequests,
            Title = "Too Many Requests",
            Detail = "Too many requests. Please try again later.",
            Instance = httpContext.Request.Path,
        };

        problem.Extensions["traceId"] = correlationId;
        problem.Extensions["correlationId"] = correlationId;

        await httpContext.Response.WriteAsJsonAsync(
            problem,
            options: null,
            contentType: ProblemDetailsContentType,
            cancellationToken: cancellationToken);
    }
}
