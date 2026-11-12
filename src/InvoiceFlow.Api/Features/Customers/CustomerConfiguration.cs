using InvoiceFlow.Api.Features.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InvoiceFlow.Api.Features.Customers;

public sealed class CustomerConfiguration : IEntityTypeConfiguration<Customer>
{
    public void Configure(EntityTypeBuilder<Customer> builder)
    {
        builder.ToTable("Customers", table =>
        {
            table.HasCheckConstraint(
                "CK_Customers_Name_NotEmpty",
                "char_length(btrim(\"Name\")) > 0");
            table.HasCheckConstraint(
                "CK_Customers_TaxNumber_Valid",
                "\"TaxNumber\" IS NULL OR \"TaxNumber\" ~ '^[0-9]{10,11}$'");
        });

        builder.HasKey(customer => customer.Id);

        builder.Property(customer => customer.Name)
            .IsRequired()
            .HasMaxLength(200);

        builder.Property(customer => customer.Email).HasMaxLength(320);

        builder.Property(customer => customer.Phone).HasMaxLength(30);

        builder.Property(customer => customer.Address).HasMaxLength(500);

        builder.Property(customer => customer.TaxNumber).HasMaxLength(11);

        builder.Property(customer => customer.CreatedAt)
            .IsRequired()
            .HasColumnType("timestamp with time zone");

        builder.Property(customer => customer.UpdatedAt)
            .HasColumnType("timestamp with time zone");

        // Supports ownership-scoped queries and the composite foreign key from Invoices.
        builder.HasIndex(customer => customer.OwnerId);

        // Allows Invoices to reference (Id, OwnerId) so the invoice owner must match
        // the customer owner at the database level.
        builder.HasAlternateKey(customer => new { customer.Id, customer.OwnerId });

        builder.HasOne(customer => customer.Owner)
            .WithMany()
            .HasForeignKey(customer => customer.OwnerId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
