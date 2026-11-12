using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Customers;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InvoiceFlow.Api.Features.Invoices;

public sealed class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> builder)
    {
        builder.ToTable("Invoices", table =>
        {
            table.HasCheckConstraint("CK_Invoices_Subtotal_NonNegative", "\"Subtotal\" >= 0");
            table.HasCheckConstraint("CK_Invoices_TaxTotal_NonNegative", "\"TaxTotal\" >= 0");
            table.HasCheckConstraint("CK_Invoices_GrandTotal_NonNegative", "\"GrandTotal\" >= 0");
            table.HasCheckConstraint(
                "CK_Invoices_DueDate_OnOrAfter_IssueDate",
                "\"DueDate\" >= \"IssueDate\"");
            table.HasCheckConstraint(
                "CK_Invoices_Status_Valid",
                "\"Status\" IN ('Draft', 'Sent', 'Paid', 'Cancelled')");
        });

        builder.HasKey(invoice => invoice.Id);

        builder.Property(invoice => invoice.InvoiceNumber)
            .IsRequired()
            .HasMaxLength(50);

        builder.Property(invoice => invoice.IssueDate)
            .HasColumnType("date");

        builder.Property(invoice => invoice.DueDate)
            .HasColumnType("date");

        builder.Property(invoice => invoice.Status)
            .IsRequired()
            .HasConversion<string>()
            .HasMaxLength(20);

        builder.Property(invoice => invoice.Currency)
            .IsRequired()
            .HasMaxLength(3)
            .HasDefaultValue("TRY");

        builder.Property(invoice => invoice.Subtotal).HasPrecision(18, 2);

        builder.Property(invoice => invoice.TaxTotal).HasPrecision(18, 2);

        builder.Property(invoice => invoice.GrandTotal).HasPrecision(18, 2);

        builder.Property(invoice => invoice.CreatedAt)
            .IsRequired()
            .HasColumnType("timestamp with time zone");

        builder.Property(invoice => invoice.UpdatedAt)
            .HasColumnType("timestamp with time zone");

        builder.HasIndex(invoice => invoice.InvoiceNumber).IsUnique();
        builder.HasIndex(invoice => invoice.OwnerId);
        builder.HasIndex(invoice => invoice.CustomerId);
        builder.HasIndex(invoice => invoice.Status);
        builder.HasIndex(invoice => invoice.IssueDate);

        // The uint row version is mapped by Npgsql to PostgreSQL's internal xmin system
        // column, which changes on every update. No physical column is added.
        builder.Property(invoice => invoice.Version).IsRowVersion();

        builder.HasOne(invoice => invoice.Owner)
            .WithMany()
            .HasForeignKey(invoice => invoice.OwnerId)
            .OnDelete(DeleteBehavior.Restrict);

        // Composite foreign key: an invoice can only reference a customer that has
        // the same owner.
        builder.HasOne(invoice => invoice.Customer)
            .WithMany(customer => customer.Invoices)
            .HasForeignKey(invoice => new { invoice.CustomerId, invoice.OwnerId })
            .HasPrincipalKey(customer => new { customer.Id, customer.OwnerId })
            .OnDelete(DeleteBehavior.Restrict);
    }
}
