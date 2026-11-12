using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace InvoiceFlow.Api.Infrastructure.HealthChecks;

/// <summary>
/// Writes health check results using the stable JSON contract of the API.
/// </summary>
public static class HealthCheckResponseWriter
{
    public static Task WriteAsync(HttpContext context, HealthReport report)
    {
        context.Response.ContentType = "application/json; charset=utf-8";

        return context.Response.WriteAsJsonAsync(
            new HealthResponse(report.Status.ToString()),
            cancellationToken: context.RequestAborted);
    }

    private sealed record HealthResponse(string Status);
}
