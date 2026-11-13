using System.Net;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Infrastructure;
using InvoiceFlow.Api.Infrastructure.Cors;
using InvoiceFlow.Api.Infrastructure.HealthChecks;
using InvoiceFlow.Api.Infrastructure.Observability;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);

// One HTTP request log is emitted by RequestLoggingMiddleware. JSON is used outside
// Development so production log collectors receive structured records.
builder.Logging.ClearProviders();

if (builder.Environment.IsDevelopment())
{
    builder.Logging.AddSimpleConsole(options =>
    {
        options.SingleLine = true;
        options.IncludeScopes = true;
        options.TimestampFormat = "HH:mm:ss ";
    });
}
else
{
    builder.Logging.AddJsonConsole(options =>
    {
        options.IncludeScopes = true;
        options.UseUtcTimestamp = true;
        options.TimestampFormat = "yyyy-MM-ddTHH:mm:ss.fffZ";
    });
}

builder.Services.AddInvoiceFlowServices(builder.Configuration);

// X-Forwarded-For is only honored for explicitly configured proxy addresses. Without
// this section the API uses the direct connection address for rate-limit partitioning.
var knownProxies = builder.Configuration.GetSection("ReverseProxy:KnownProxies").Get<string[]>();

if (knownProxies is { Length: > 0 })
{
    builder.Services.Configure<ForwardedHeadersOptions>(options =>
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        options.KnownIPNetworks.Clear();
        options.KnownProxies.Clear();

        foreach (var proxy in knownProxies)
        {
            if (IPAddress.TryParse(proxy, out var address))
            {
                options.KnownProxies.Add(address);
            }
        }
    });
}

var app = builder.Build();

// Explicit, opt-in admin provisioning. The command does not start the web server.
if (args.Contains("--provision-admin", StringComparer.Ordinal))
{
    using var scope = app.Services.CreateScope();
    var provisioner = scope.ServiceProvider.GetRequiredService<AdminProvisioner>();
    var result = await provisioner.ProvisionAsync();

    // The message never contains credentials.
    Console.WriteLine(result.Message);

    return result.Succeeded ? 0 : 1;
}

if (knownProxies is { Length: > 0 })
{
    app.UseForwardedHeaders();
}

// Correlation first so the identifier is available to logging and every error response.
app.UseMiddleware<CorrelationIdMiddleware>();
app.UseMiddleware<RequestLoggingMiddleware>();

// The same safe exception contract is used in every environment. Production never
// exposes stack traces; internal details remain in the logs.
app.UseExceptionHandler();
app.UseStatusCodePages();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();

    // In production the API is expected to sit behind a TLS-terminating proxy or to
    // listen on HTTPS directly. Development uses the HTTPS launch profile instead.
    app.UseHttpsRedirection();
}

app.UseCors(CorsExtensions.PolicyName);
app.UseRateLimiter();

if (app.Environment.IsDevelopment())
{
    // Exposes the OpenAPI document at /openapi/v1.json and Swagger UI at /swagger.
    app.UseSwaggerUI(options =>
        options.SwaggerEndpoint("/openapi/v1.json", "InvoiceFlow API v1"));

    app.MapOpenApi();
}

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Readiness includes the PostgreSQL check; liveness intentionally has no dependencies.
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = HealthCheckResponseWriter.WriteAsync,
});

app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false,
    ResponseWriter = HealthCheckResponseWriter.WriteAsync,
});

app.Run();

return 0;

// Exposed so the integration test host can boot the real application pipeline.
public partial class Program
{
}
