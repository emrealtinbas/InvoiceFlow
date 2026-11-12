namespace InvoiceFlow.Api.Infrastructure.Persistence;

/// <summary>
/// Marks an entity whose creation and modification timestamps are maintained by
/// <see cref="AppDbContext"/> in UTC.
/// </summary>
public interface IAuditableEntity
{
    DateTime CreatedAt { get; set; }

    DateTime? UpdatedAt { get; set; }
}
