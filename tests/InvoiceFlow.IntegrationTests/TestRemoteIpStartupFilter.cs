using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;

namespace InvoiceFlow.IntegrationTests;

/// <summary>
/// Test-only middleware that sets the connection address from a header so rate-limit
/// partitions can be exercised independently. It is never registered in the API.
/// </summary>
public sealed class TestRemoteIpStartupFilter : IStartupFilter
{
    public const string HeaderName = "X-Test-Client-IP";

    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
    {
        app.Use(async (context, nextMiddleware) =>
        {
            if (context.Request.Headers.TryGetValue(HeaderName, out var value) &&
                IPAddress.TryParse(value, out var address))
            {
                context.Connection.RemoteIpAddress = address;
            }

            await nextMiddleware();
        });

        next(app);
    };
}
