namespace InvoiceFlow.Api.Features.Auth;

/// <summary>
/// Configuration for the explicit admin provisioning command. Disabled by default;
/// credentials are supplied through environment variables or user secrets.
/// </summary>
public sealed class AdminProvisioningOptions
{
    public const string SectionName = "AdminProvisioning";

    public bool Enabled { get; set; }

    public string? Email { get; set; }

    public string? Password { get; set; }
}
