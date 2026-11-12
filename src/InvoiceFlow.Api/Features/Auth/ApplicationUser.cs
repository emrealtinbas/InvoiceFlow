using InvoiceFlow.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;

namespace InvoiceFlow.Api.Features.Auth;

/// <summary>
/// Application user. Authentication and authorization are implemented in a later phase;
/// this entity only prepares the Identity persistence model.
/// </summary>
public sealed class ApplicationUser : IdentityUser<Guid>, IAuditableEntity
{
    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }
}
