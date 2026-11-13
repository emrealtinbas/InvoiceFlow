namespace InvoiceFlow.Api.Infrastructure.Cors;

/// <summary>
/// Explicit, opt-in CORS. When no origins are configured the policy allows none, so the
/// default is no cross-origin access. Credentials are never enabled.
/// </summary>
public static class CorsExtensions
{
    public const string PolicyName = "ConfiguredOrigins";

    public static IServiceCollection AddInvoiceFlowCors(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

        services.AddCors(options =>
        {
            options.AddPolicy(PolicyName, policy =>
            {
                if (allowedOrigins.Length == 0)
                {
                    return;
                }

                policy
                    .WithOrigins(allowedOrigins)
                    .AllowAnyHeader()
                    .AllowAnyMethod();
            });
        });

        return services;
    }
}
