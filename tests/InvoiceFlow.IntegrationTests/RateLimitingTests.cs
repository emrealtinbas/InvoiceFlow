using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.AspNetCore.Mvc;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class RateLimitingTests(PostgresContainerFixture fixture) : AuthTestBase(fixture)
{
    private const string WrongPassword = "WrongPass123!";

    [Fact]
    public async Task Login_ExceedsTheLimit_ReturnsTooManyRequests()
    {
        for (var attempt = 0; attempt < 10; attempt++)
        {
            using var allowed = await PostLoginAsync(new LoginRequest
            {
                Email = "rate-limit-login@example.com",
                Password = WrongPassword,
            });

            Assert.Equal(HttpStatusCode.Unauthorized, allowed.StatusCode);
        }

        using var rejected = await PostLoginAsync(new LoginRequest
        {
            Email = "rate-limit-login@example.com",
            Password = WrongPassword,
        });

        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.Equal("application/problem+json", rejected.Content.Headers.ContentType?.MediaType);

        var retryAfter = Assert.Single(rejected.Headers.GetValues("Retry-After"));

        Assert.True(int.TryParse(retryAfter, out var seconds));
        Assert.InRange(seconds, 1, 60);

        var problem = await rejected.Content.ReadFromJsonAsync<ProblemDetails>();

        Assert.NotNull(problem);
        Assert.Equal((int)HttpStatusCode.TooManyRequests, problem.Status);
        Assert.True(problem.Extensions.ContainsKey("traceId"));
    }

    [Fact]
    public async Task Register_ExceedsTheLimit_ReturnsTooManyRequests()
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            using var allowed = await PostRegisterAsync(new RegisterRequest
            {
                Email = $"rate-register-{attempt}@example.com",
                Password = StrongPassword,
            });

            Assert.Equal(HttpStatusCode.Created, allowed.StatusCode);
        }

        using var rejected = await PostRegisterAsync(new RegisterRequest
        {
            Email = "rate-register-blocked@example.com",
            Password = StrongPassword,
        });

        Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
        Assert.Equal("application/problem+json", rejected.Content.Headers.ContentType?.MediaType);

        var retryAfter = Assert.Single(rejected.Headers.GetValues("Retry-After"));

        Assert.True(int.TryParse(retryAfter, out var seconds));
        Assert.InRange(seconds, 1, 60);
    }

    [Fact]
    public async Task Limits_ArePartitionedByClientAddress()
    {
        for (var attempt = 0; attempt < 10; attempt++)
        {
            using var allowed = await SendLoginFromAsync("203.0.113.10");

            Assert.Equal(HttpStatusCode.Unauthorized, allowed.StatusCode);
        }

        using var blocked = await SendLoginFromAsync("203.0.113.10");

        Assert.Equal(HttpStatusCode.TooManyRequests, blocked.StatusCode);

        using var independent = await SendLoginFromAsync("203.0.113.11");

        Assert.Equal(HttpStatusCode.Unauthorized, independent.StatusCode);
    }

    private async Task<HttpResponseMessage> SendLoginFromAsync(string clientAddress)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login");

        request.Headers.Add(TestRemoteIpStartupFilter.HeaderName, clientAddress);
        request.Content = JsonContent.Create(new LoginRequest
        {
            Email = "rate-limit-partition@example.com",
            Password = WrongPassword,
        });

        return await Client.SendAsync(request);
    }
}
