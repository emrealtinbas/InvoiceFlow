using InvoiceFlow.Api.Infrastructure.Observability;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace InvoiceFlow.Api.Infrastructure.Errors;

/// <summary>
/// Converts unhandled exceptions into a safe ProblemDetails response. The exception is
/// logged with its correlation identifier for internal diagnostics; the response never
/// contains stack traces, exception types, connection strings, or SQL details.
/// </summary>
public sealed class GlobalExceptionHandler(
    ILogger<GlobalExceptionHandler> logger,
    IProblemDetailsService problemDetailsService) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var correlationId = httpContext.GetCorrelationId();

        logger.LogError(
            exception,
            "Unhandled exception while processing {Method} {Path} with correlation {CorrelationId}",
            httpContext.Request.Method,
            httpContext.Request.Path.Value,
            correlationId);

        httpContext.Response.StatusCode = StatusCodes.Status500InternalServerError;

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "An unexpected error occurred.",
                Detail = "The server could not process the request.",
                Instance = httpContext.Request.Path,
            },
        });
    }
}
