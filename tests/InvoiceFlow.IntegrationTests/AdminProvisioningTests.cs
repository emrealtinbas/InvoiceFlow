using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Infrastructure.Persistence;
using InvoiceFlow.IntegrationTests.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class AdminProvisioningTests(PostgresContainerFixture fixture) : AuthTestBase(fixture)
{
    private const string AdminEmail = "provisioned-admin@example.com";
    private const string AdminPassword = "ProvisionedAdmin123!";

    [Fact]
    public async Task Provisioning_CreatesAdminAndUserRoles()
    {
        var result = await ProvisionAsync(new AdminProvisioningOptions
        {
            Enabled = true,
            Email = AdminEmail,
            Password = AdminPassword,
        });

        Assert.Equal(AdminProvisioningStatus.Created, result.Status);

        using var scope = Factory.Services.CreateScope();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();

        Assert.True(await roleManager.RoleExistsAsync(AuthRoles.Admin));
        Assert.True(await roleManager.RoleExistsAsync(AuthRoles.User));
    }

    [Fact]
    public async Task Provisioning_IsDisabledByDefault()
    {
        using var scope = Factory.Services.CreateScope();
        var configured = scope.ServiceProvider
            .GetRequiredService<IOptions<AdminProvisioningOptions>>()
            .Value;

        Assert.False(configured.Enabled);

        var result = await ProvisionAsync(new AdminProvisioningOptions());

        Assert.Equal(AdminProvisioningStatus.Disabled, result.Status);
        Assert.Null(await FindUserAsync(AdminEmail));
    }

    [Fact]
    public async Task Provisioning_CreatesAdmin()
    {
        var result = await ProvisionAsync(new AdminProvisioningOptions
        {
            Enabled = true,
            Email = AdminEmail,
            Password = AdminPassword,
        });

        Assert.Equal(AdminProvisioningStatus.Created, result.Status);

        var user = await FindUserAsync(AdminEmail);

        Assert.NotNull(user);

        var roles = await GetRolesAsync(user.Id);

        Assert.Contains(AuthRoles.Admin, roles);

        using var scope = Factory.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var stored = await userManager.FindByEmailAsync(AdminEmail);

        Assert.NotNull(stored);
        Assert.True(await userManager.CheckPasswordAsync(stored, AdminPassword));
    }

    [Fact]
    public async Task Provisioning_IsIdempotent()
    {
        var options = new AdminProvisioningOptions
        {
            Enabled = true,
            Email = AdminEmail,
            Password = AdminPassword,
        };

        var first = await ProvisionAsync(options);
        var second = await ProvisionAsync(options);

        Assert.Equal(AdminProvisioningStatus.Created, first.Status);
        Assert.Equal(AdminProvisioningStatus.AlreadyProvisioned, second.Status);

        using var scope = Factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        Assert.Equal(1, await dbContext.Users.CountAsync(user => user.Email == AdminEmail));

        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var user = await userManager.FindByEmailAsync(AdminEmail);

        Assert.NotNull(user);
        Assert.True(await userManager.CheckPasswordAsync(user, AdminPassword));
    }

    [Fact]
    public async Task Provisioning_DoesNotPromoteExistingNormalUser()
    {
        const string email = "existing-user@example.com";
        await CreateUserAsync(email);

        var result = await ProvisionAsync(new AdminProvisioningOptions
        {
            Enabled = true,
            Email = email,
            Password = "DifferentAdmin123!",
        });

        Assert.Equal(AdminProvisioningStatus.ExistingUserNotAdmin, result.Status);

        var user = await FindUserAsync(email);

        Assert.NotNull(user);

        var roles = await GetRolesAsync(user.Id);

        Assert.DoesNotContain(AuthRoles.Admin, roles);

        using var scope = Factory.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var stored = await userManager.FindByEmailAsync(email);

        Assert.NotNull(stored);

        // The existing password must not be overwritten.
        Assert.True(await userManager.CheckPasswordAsync(stored, StrongPassword));
        Assert.False(await userManager.CheckPasswordAsync(stored, "DifferentAdmin123!"));
    }

    [Fact]
    public async Task Provisioning_DoesNotLogCredentials()
    {
        const string email = "logged-admin@example.com";
        const string password = "LoggedAdminSecret123!Unique";
        var logger = new ListLogger<AdminProvisioner>();

        var result = await ProvisionAsync(
            new AdminProvisioningOptions
            {
                Enabled = true,
                Email = email,
                Password = password,
            },
            logger);

        Assert.Equal(AdminProvisioningStatus.Created, result.Status);
        Assert.NotEmpty(logger.Messages);
        Assert.DoesNotContain(
            logger.Messages,
            message => message.Contains(password, StringComparison.Ordinal));
    }

    private async Task<AdminProvisioningResult> ProvisionAsync(
        AdminProvisioningOptions options,
        ListLogger<AdminProvisioner>? logger = null)
    {
        using var scope = Factory.Services.CreateScope();
        var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
        var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();

        var provisioner = new AdminProvisioner(
            userManager,
            roleManager,
            Options.Create(options),
            logger ?? new ListLogger<AdminProvisioner>());

        return await provisioner.ProvisionAsync();
    }
}
