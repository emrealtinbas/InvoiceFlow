using System.Globalization;
using InvoiceFlow.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace InvoiceFlow.Api.Features.Invoices;

/// <summary>Generates globally unique invoice numbers from a PostgreSQL sequence.</summary>
public sealed class InvoiceNumberGenerator(AppDbContext dbContext)
{
    public async Task<string> NextAsync(DateOnly issueDate, CancellationToken cancellationToken)
    {
        var values = await dbContext.Database
            .SqlQueryRaw<long>("SELECT nextval('\"InvoiceNumberSequence\"') AS \"Value\"")
            .ToListAsync(cancellationToken);
        var sequenceValue = values.Single();

        return string.Create(
            CultureInfo.InvariantCulture,
            $"INV-{issueDate.Year:D4}-{sequenceValue:D6}");
    }
}
