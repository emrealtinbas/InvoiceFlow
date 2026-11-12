using System.Globalization;
using InvoiceFlow.Api.Features.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace InvoiceFlow.IntegrationTests;

/// <summary>
/// Boots the real API pipeline in the Development environment so that
/// development-only endpoints (OpenAPI, Swagger UI) are exercised.
/// </summary>
public sealed class InvoiceFlowApiFactory : WebApplicationFactory<Program>
{
    private readonly string? _connectionString;
    private readonly bool _failRoleAssignment;
    private readonly string _environment;

    public InvoiceFlowApiFactory()
    {
        _environment = "Development";
    }

    public InvoiceFlowApiFactory(
        string? connectionString,
        bool failRoleAssignment = false,
        string environment = "Development")
    {
        _connectionString = connectionString;
        _failRoleAssignment = failRoleAssignment;
        _environment = environment;
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(_environment);

        builder.UseSetting("Jwt:Issuer", TestJwt.Issuer);
        builder.UseSetting("Jwt:Audience", TestJwt.Audience);
        builder.UseSetting(
            "Jwt:AccessTokenMinutes",
            TestJwt.AccessTokenMinutes.ToString(CultureInfo.InvariantCulture));
        builder.UseSetting("Jwt:SigningKey", TestJwt.SigningKey);

        if (!string.IsNullOrWhiteSpace(_connectionString))
        {
            builder.UseSetting("ConnectionStrings:DefaultConnection", _connectionString);
        }

        builder.ConfigureTestServices(services =>
        {
            // The authorization test endpoints live in this test assembly only.
            services.AddControllers()
                .AddApplicationPart(typeof(TestAuthorizationController).Assembly);

            if (_failRoleAssignment)
            {
                services.AddScoped<UserManager<ApplicationUser>>(provider => new FailingUserManager(
                    provider.GetRequiredService<IUserStore<ApplicationUser>>(),
                    provider.GetRequiredService<IOptions<IdentityOptions>>(),
                    provider.GetRequiredService<IPasswordHasher<ApplicationUser>>(),
                    provider.GetRequiredService<IEnumerable<IUserValidator<ApplicationUser>>>(),
                    provider.GetRequiredService<IEnumerable<IPasswordValidator<ApplicationUser>>>(),
                    provider.GetRequiredService<ILookupNormalizer>(),
                    provider.GetRequiredService<IdentityErrorDescriber>(),
                    provider,
                    provider.GetRequiredService<ILogger<UserManager<ApplicationUser>>>()));
            }
        });
    }

    /// <summary>Simulates a role-assignment failure without weakening production code.</summary>
    private sealed class FailingUserManager(
        IUserStore<ApplicationUser> store,
        IOptions<IdentityOptions> optionsAccessor,
        IPasswordHasher<ApplicationUser> passwordHasher,
        IEnumerable<IUserValidator<ApplicationUser>> userValidators,
        IEnumerable<IPasswordValidator<ApplicationUser>> passwordValidators,
        ILookupNormalizer keyNormalizer,
        IdentityErrorDescriber errors,
        IServiceProvider services,
        ILogger<UserManager<ApplicationUser>> logger)
        : UserManager<ApplicationUser>(
            store,
            optionsAccessor,
            passwordHasher,
            userValidators,
            passwordValidators,
            keyNormalizer,
            errors,
            services,
            logger)
    {
        public override Task<IdentityResult> AddToRoleAsync(ApplicationUser user, string role) =>
            Task.FromResult(IdentityResult.Failed(new IdentityError
            {
                Code = "RoleAssignmentFailed",
                Description = "Simulated role assignment failure.",
            }));
    }
}
