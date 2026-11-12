using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace InvoiceFlow.Api.Features.Auth;

public enum AdminProvisioningStatus
{
    Disabled,
    Created,
    AlreadyProvisioned,
    ExistingUserNotAdmin,
    Failed,
}

public sealed record AdminProvisioningResult(AdminProvisioningStatus Status, string Message)
{
    public bool Succeeded =>
        Status is AdminProvisioningStatus.Created or AdminProvisioningStatus.AlreadyProvisioned;
}

/// <summary>
/// Explicit, idempotent admin provisioning. It never promotes an existing non-admin
/// account and never overwrites an existing password.
/// </summary>
public sealed class AdminProvisioner(
    UserManager<ApplicationUser> userManager,
    RoleManager<IdentityRole<Guid>> roleManager,
    IOptions<AdminProvisioningOptions> options,
    ILogger<AdminProvisioner> logger)
{
    public async Task<AdminProvisioningResult> ProvisionAsync(CancellationToken cancellationToken = default)
    {
        var configuration = options.Value;

        if (!configuration.Enabled)
        {
            return new AdminProvisioningResult(
                AdminProvisioningStatus.Disabled,
                "Admin provisioning is disabled. Set AdminProvisioning__Enabled=true to run it.");
        }

        if (string.IsNullOrWhiteSpace(configuration.Email) || string.IsNullOrWhiteSpace(configuration.Password))
        {
            return new AdminProvisioningResult(
                AdminProvisioningStatus.Failed,
                "Admin provisioning requires AdminProvisioning__Email and AdminProvisioning__Password.");
        }

        await EnsureRolesAsync(cancellationToken);

        var email = configuration.Email.Trim();
        var existing = await userManager.FindByEmailAsync(email);

        if (existing is not null)
        {
            if (await userManager.IsInRoleAsync(existing, AuthRoles.Admin))
            {
                logger.LogInformation("Admin provisioning skipped: the configured account is already an Admin.");
                return new AdminProvisioningResult(
                    AdminProvisioningStatus.AlreadyProvisioned,
                    "The configured account is already an Admin. No changes were made.");
            }

            logger.LogWarning(
                "Admin provisioning refused to promote an existing non-admin account. " +
                "Use a different e-mail address or grant the role explicitly.");
            return new AdminProvisioningResult(
                AdminProvisioningStatus.ExistingUserNotAdmin,
                "An account with the configured e-mail already exists and is not an Admin. " +
                "It was not promoted automatically.");
        }

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            LockoutEnabled = true,
        };

        var createResult = await userManager.CreateAsync(user, configuration.Password);

        if (!createResult.Succeeded)
        {
            logger.LogError(
                "Admin provisioning failed while creating the account: {Errors}",
                string.Join("; ", createResult.Errors.Select(error => error.Code)));
            return new AdminProvisioningResult(
                AdminProvisioningStatus.Failed,
                "The admin account could not be created. Check the server logs for details.");
        }

        var roleResult = await userManager.AddToRoleAsync(user, AuthRoles.Admin);

        if (!roleResult.Succeeded)
        {
            logger.LogError(
                "Admin provisioning failed while assigning the Admin role: {Errors}",
                string.Join("; ", roleResult.Errors.Select(error => error.Code)));

            // Do not leave a partially provisioned account behind.
            await userManager.DeleteAsync(user);

            return new AdminProvisioningResult(
                AdminProvisioningStatus.Failed,
                "The admin account could not be assigned the Admin role and was removed.");
        }

        logger.LogInformation("Admin account provisioned successfully.");
        return new AdminProvisioningResult(
            AdminProvisioningStatus.Created,
            "The admin account was created and assigned the Admin role.");
    }

    /// <summary>Creates the Admin and User roles when they do not exist yet.</summary>
    public async Task EnsureRolesAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        await EnsureRoleAsync(AuthRoles.Admin);
        await EnsureRoleAsync(AuthRoles.User);
    }

    private async Task EnsureRoleAsync(string roleName)
    {
        if (await roleManager.RoleExistsAsync(roleName))
        {
            return;
        }

        var result = await roleManager.CreateAsync(new IdentityRole<Guid>(roleName) { Id = Guid.NewGuid() });

        if (!result.Succeeded)
        {
            logger.LogError(
                "Failed to create role {Role}: {Errors}",
                roleName,
                string.Join("; ", result.Errors.Select(error => error.Code)));
        }
    }
}
