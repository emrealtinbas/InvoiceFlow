using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InvoiceFlow.Api.Features.Invoices;

public sealed class InvoiceItemConfiguration : IEntityTypeConfiguration<InvoiceItem>
{
    public void Configure(EntityTypeBuilder<InvoiceItem> builder)
    {
        builder.ToTable("InvoiceItems", table =>
        {
            table.HasCheckConstraint("CK_InvoiceItems_Quantity_Positive", "\"Quantity\" > 0");
            table.HasCheckConstraint("CK_InvoiceItems_UnitPrice_NonNegative", "\"UnitPrice\" >= 0");
            table.HasCheckConstraint(
                "CK_InvoiceItems_TaxRate_Range",
                "\"TaxRate\" >= 0 AND \"TaxRate\" <= 100");
            table.HasCheckConstraint(
                "CK_InvoiceItems_LineSubtotal_NonNegative",
                "\"LineSubtotal\" >= 0");
            table.HasCheckConstraint("CK_InvoiceItems_LineTax_NonNegative", "\"LineTax\" >= 0");
            table.HasCheckConstraint("CK_InvoiceItems_LineTotal_NonNegative", "\"LineTotal\" >= 0");
        });

        builder.HasKey(item => item.Id);

        builder.Property(item => item.Description)
            .IsRequired()
            .HasMaxLength(500);

        builder.Property(item => item.Quantity).HasPrecision(18, 3);

        builder.Property(item => item.UnitPrice).HasPrecision(18, 2);

        builder.Property(item => item.TaxRate).HasPrecision(5, 2);

        builder.Property(item => item.LineSubtotal).HasPrecision(18, 2);

        builder.Property(item => item.LineTax).HasPrecision(18, 2);

        builder.Property(item => item.LineTotal).HasPrecision(18, 2);

        builder.HasIndex(item => item.InvoiceId);

        // Items are owned by their invoice; deleting an invoice removes its lines.
        // Draft-only deletion rules are enforced by the application in Phase 6.
        builder.HasOne(item => item.Invoice)
            .WithMany(invoice => invoice.Items)
            .HasForeignKey(item => item.InvoiceId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
