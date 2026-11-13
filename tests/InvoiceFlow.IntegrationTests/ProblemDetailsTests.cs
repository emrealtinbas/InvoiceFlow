using System.Net;
using System.Net.Http.Json;
using System.Text;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.AspNetCore.Mvc;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class ProblemDetailsTests(PostgresContainerFixture fixture) : AuthTestBase(fixture)
{
    [Fact]
    public async Task MalformedJson_ReturnsConsistentBadRequest()
    {
        using var content = new StringContent(
            """{ "email": """,
            Encoding.UTF8,
            "application/json");

        using var response = await Client.PostAsync("/api/auth/login", content);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();

        Assert.NotNull(problem);
        Assert.Equal((int)HttpStatusCode.BadRequest, problem.Status);
        Assert.NotEmpty(problem.Errors);
        await AssertCorrelationIdAsync(response, problem);
    }

    [Fact]
    public async Task ValidationFailure_ReturnsConsistentProblemDetails()
    {
        using var response = await PostRegisterAsync(new RegisterRequest
        {
            Email = "not-an-email",
            Password = StrongPassword,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();

        Assert.NotNull(problem);
        Assert.Equal((int)HttpStatusCode.BadRequest, problem.Status);
        Assert.Contains(nameof(RegisterRequest.Email), problem.Errors.Keys);
        await AssertCorrelationIdAsync(response, problem);
    }

    [Fact]
    public async Task UnauthenticatedRequest_ReturnsSafeUnauthorizedProblem()
    {
        using var response = await Client.GetAsync("/api/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var problem = await ReadProblemAsync(response);
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal((int)HttpStatusCode.Unauthorized, problem.Status);
        Assert.Equal("Unauthorized", problem.Title);
        Assert.DoesNotContain("bearer", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("token", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ForbiddenRequest_ReturnsSafeForbiddenProblem()
    {
        const string email = "problem-forbidden@example.com";
        await RegisterAsync(email);
        var login = await LoginAsync(email);

        using var response = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/test/authorization/admin",
            login.AccessToken);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var problem = await ReadProblemAsync(response);

        Assert.Equal((int)HttpStatusCode.Forbidden, problem.Status);
        Assert.Equal("Forbidden", problem.Title);
    }

    [Fact]
    public async Task Conflict_ReturnsSafeConflictProblem()
    {
        const string email = "problem-conflict@example.com";
        await RegisterAsync(email);

        using var response = await PostRegisterAsync(new RegisterRequest
        {
            Email = email,
            Password = StrongPassword,
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var problem = await ReadProblemAsync(response);

        Assert.Equal((int)HttpStatusCode.Conflict, problem.Status);
        Assert.Equal("Conflict", problem.Title);
    }

    [Fact]
    public async Task UnexpectedError_ReturnsSafeProblemWithoutInternals()
    {
        using var response = await Client.GetAsync("/api/test/authorization/throw");

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var body = await response.Content.ReadAsStringAsync();

        Assert.DoesNotContain("Sensitive server detail", body, StringComparison.Ordinal);
        Assert.DoesNotContain("InvalidOperationException", body, StringComparison.Ordinal);
        Assert.DoesNotContain("StackTrace", body, StringComparison.OrdinalIgnoreCase);

        var problem = await ReadProblemAsync(response);

        Assert.Equal((int)HttpStatusCode.InternalServerError, problem.Status);
    }

    [Fact]
    public async Task UnknownRoute_ReturnsProblemDetails()
    {
        using var response = await Client.GetAsync("/api/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);

        var problem = await ReadProblemAsync(response);

        Assert.Equal((int)HttpStatusCode.NotFound, problem.Status);
    }

    private static Task AssertCorrelationIdAsync(
        HttpResponseMessage response,
        ProblemDetails problem)
    {
        var correlationId = Assert.Single(response.Headers.GetValues("X-Correlation-ID"));

        Assert.True(problem.Extensions.TryGetValue("traceId", out var traceId));
        Assert.Equal(correlationId, traceId?.ToString());

        return Task.CompletedTask;
    }

    private static async Task<ProblemDetails> ReadProblemAsync(HttpResponseMessage response)
    {
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();

        Assert.NotNull(problem);
        return problem;
    }
}
