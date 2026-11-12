using System.Text;
using InvoiceFlow.Api.Infrastructure.HealthChecks;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace InvoiceFlow.UnitTests.Infrastructure;

public sealed class HealthCheckResponseWriterTests
{
    [Fact]
    public async Task WriteAsync_WritesHealthyStatusAsJson()
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        var report = new HealthReport(
            new Dictionary<string, HealthReportEntry>(),
            TimeSpan.Zero);

        await HealthCheckResponseWriter.WriteAsync(context, report);

        context.Response.Body.Seek(0, SeekOrigin.Begin);
        using var reader = new StreamReader(context.Response.Body, Encoding.UTF8);
        var json = await reader.ReadToEndAsync();

        Assert.Equal("""{"status":"Healthy"}""", json);
        Assert.Equal("application/json; charset=utf-8", context.Response.ContentType);
    }
}
