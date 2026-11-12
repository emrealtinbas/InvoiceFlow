using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace InvoiceFlow.Api.Features.Auth;

public sealed class ApplicationUserConfiguration : IEntityTypeConfiguration<ApplicationUser>
{
    public void Configure(EntityTypeBuilder<ApplicationUser> builder)
    {
        builder.Property(user => user.CreatedAt)
            .IsRequired()
            .HasColumnType("timestamp with time zone");

        builder.Property(user => user.UpdatedAt)
            .HasColumnType("timestamp with time zone");
    }
}
