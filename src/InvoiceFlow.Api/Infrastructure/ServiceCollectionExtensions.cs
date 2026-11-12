using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Infrastructure.OpenApi;
using InvoiceFlow.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace InvoiceFlow.Api.Infrastructure;

/// <summary>
/// Composes the application's services. Keeping this out of <c>Program.cs</c> lets
/// the explicit admin provisioning command reuse exactly the same registrations.
/// </summary>
public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddInvoiceFlowServices(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException(
                "Connection string 'DefaultConnection' is not configured. Set it in appsettings.json " +
                "or through the ConnectionStrings__DefaultConnection environment variable.");

        services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));

        services.AddHttpContextAccessor();
        services.AddSingleton(TimeProvider.System);

        services.AddOptions<AdminProvisioningOptions>()
            .Bind(configuration.GetSection(AdminProvisioningOptions.SectionName));

        AddIdentity(services);
        AddJwtAuthentication(services, configuration);
        AddAuthorizationPolicies(services);

        services.AddScoped<ICurrentUser, CurrentUser>();
        services.AddSingleton<JwtTokenService>();
        services.AddScoped<AdminProvisioner>();

        services.AddControllers();
        services.AddProblemDetails();
        services.AddInvoiceFlowOpenApi();
        services.AddHealthChecks()
            .AddDbContextCheck<AppDbContext>("database");

        return services;
    }

    private static void AddIdentity(IServiceCollection services)
    {
        services
            .AddIdentityCore<ApplicationUser>(options =>
            {
                options.User.RequireUniqueEmail = true;

                options.Password.RequiredLength = 12;
                options.Password.RequireUppercase = true;
                options.Password.RequireLowercase = true;
                options.Password.RequireDigit = true;
                options.Password.RequireNonAlphanumeric = true;

                options.Lockout.MaxFailedAccessAttempts = 5;
                options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
                options.Lockout.AllowedForNewUsers = true;
            })
            .AddRoles<IdentityRole<Guid>>()
            .AddEntityFrameworkStores<AppDbContext>()
            .AddSignInManager();
    }

    private static void AddJwtAuthentication(IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<JwtOptions>()
            .Bind(configuration.GetSection(JwtOptions.SectionName))
            .ValidateOnStart();

        services.AddSingleton<IValidateOptions<JwtOptions>, JwtOptionsValidator>();

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer();

        services.ConfigureOptions<JwtBearerOptionsSetup>();
    }

    private static void AddAuthorizationPolicies(IServiceCollection services)
    {
        services.AddAuthorizationBuilder()
            .AddPolicy(
                AuthPolicies.AdminOnly,
                policy => policy.RequireRole(AuthRoles.Admin))
            .AddPolicy(
                AuthPolicies.AuthenticatedUser,
                policy => policy.RequireAuthenticatedUser());
    }
}
