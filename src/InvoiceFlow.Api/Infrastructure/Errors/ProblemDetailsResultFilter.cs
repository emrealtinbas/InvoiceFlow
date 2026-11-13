using InvoiceFlow.Api.Infrastructure.Observability;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace InvoiceFlow.Api.Infrastructure.Errors;

/// <summary>
/// Applies the shared error contract to every ProblemDetails result produced by MVC,
/// including automatic model-state failures and manually returned ProblemDetails.
/// </summary>
public sealed class ProblemDetailsResultFilter : IAlwaysRunResultFilter
{
    public void OnResultExecuting(ResultExecutingContext context)
    {
        if (context.Result is not ObjectResult { Value: ProblemDetails problem } result)
        {
            return;
        }

        problem.Instance ??= context.HttpContext.Request.Path;

        var correlationId = context.HttpContext.GetCorrelationId();
        problem.Extensions["traceId"] = correlationId;
        problem.Extensions["correlationId"] = correlationId;

        if (!result.ContentTypes.Contains("application/problem+json"))
        {
            result.ContentTypes.Add("application/problem+json");
        }
    }

    public void OnResultExecuted(ResultExecutedContext context)
    {
        // No response mutation required after execution.
    }
}
