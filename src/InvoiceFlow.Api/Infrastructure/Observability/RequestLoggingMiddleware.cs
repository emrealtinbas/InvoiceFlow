using System.Diagnostics;

namespace InvoiceFlow.Api.Infrastructure.Observability;

/// <summary>
/// Writes one structured completion log per request. Query strings are deliberately
/// excluded so search terms and other values never reach the log sink.
/// </summary>
public sealed partial class RequestLoggingMiddleware(
    RequestDelegate next,
    ILogger<RequestLoggingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var stopwatch = Stopwatch.StartNew();

        try
        {
            await next(context);
        }
        finally
        {
            stopwatch.Stop();

            var method = context.Request.Method;
            var path = context.Request.Path.Value;
            var statusCode = context.Response.StatusCode;
            var elapsedMilliseconds = stopwatch.Elapsed.TotalMilliseconds;
            var correlationId = context.GetCorrelationId();

            // Health probes are frequent and low-value at Information level.
            if (context.Request.Path.StartsWithSegments(
                "/health",
                StringComparison.OrdinalIgnoreCase))
            {
                LogHealthRequest(
                    logger,
                    method,
                    path,
                    statusCode,
                    elapsedMilliseconds,
                    correlationId);
            }
            else
            {
                LogRequest(
                    logger,
                    method,
                    path,
                    statusCode,
                    elapsedMilliseconds,
                    correlationId);
            }
        }
    }

    [LoggerMessage(
        1,
        LogLevel.Information,
        "HTTP {Method} {Path} responded {StatusCode} in {ElapsedMilliseconds:F1} ms " +
        "with correlation {CorrelationId}")]
    private static partial void LogRequest(
        ILogger logger,
        string method,
        string? path,
        int statusCode,
        double elapsedMilliseconds,
        string correlationId);

    [LoggerMessage(
        2,
        LogLevel.Debug,
        "HTTP {Method} {Path} responded {StatusCode} in {ElapsedMilliseconds:F1} ms " +
        "with correlation {CorrelationId}")]
    private static partial void LogHealthRequest(
        ILogger logger,
        string method,
        string? path,
        int statusCode,
        double elapsedMilliseconds,
        string correlationId);
}
