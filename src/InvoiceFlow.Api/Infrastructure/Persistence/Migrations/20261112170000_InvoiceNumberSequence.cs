using InvoiceFlow.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InvoiceFlow.Api.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261112170000_InvoiceNumberSequence")]
public partial class InvoiceNumberSequence : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateSequence<long>(
            name: "InvoiceNumberSequence",
            startValue: 1L);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropSequence(name: "InvoiceNumberSequence");
    }
}
