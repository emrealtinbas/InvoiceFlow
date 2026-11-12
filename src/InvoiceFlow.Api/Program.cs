using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Infrastructure;
using InvoiceFlow.Api.Infrastructure.HealthChecks;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddInvoiceFlowServices(builder.Configuration);

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

if (app.Environment.IsDevelopment())
{
    // Exposes the OpenAPI document at /openapi/v1.json and Swagger UI at /swagger.
    app.UseSwaggerUI(options =>
        options.SwaggerEndpoint("/openapi/v1.json", "InvoiceFlow API v1"));

    app.MapOpenApi();
}
else
{
    // Production responses never include stack traces.
    app.UseExceptionHandler();

    // In production the API is expected to sit behind a TLS-terminating proxy or to
    // listen on HTTPS directly. Development uses the HTTPS launch profile instead.
    app.UseHttpsRedirection();
}

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = HealthCheckResponseWriter.WriteAsync,
});

app.Run();

return 0;

// Exposed so the integration test host can boot the real application pipeline.
public partial class Program
{
}
