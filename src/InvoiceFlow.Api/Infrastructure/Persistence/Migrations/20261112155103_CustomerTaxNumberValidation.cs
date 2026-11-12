using InvoiceFlow.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InvoiceFlow.Api.Infrastructure.Persistence.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261112155103_CustomerTaxNumberValidation")]
public partial class CustomerTaxNumberValidation : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Do not alter or discard existing customer data. Make an incompatible database
        // state explicit so it can be corrected before the stricter rule is enabled.
        migrationBuilder.Sql(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM "Customers"
                    WHERE "TaxNumber" IS NOT NULL
                      AND "TaxNumber" !~ '^[0-9]{10,11}$'
                ) THEN
                    RAISE EXCEPTION
                        'Cannot apply customer tax-number validation: existing values must contain 10 or 11 digits.';
                END IF;
            END $$;
            """);

        migrationBuilder.AlterColumn<string>(
            name: "TaxNumber",
            table: "Customers",
            type: "character varying(11)",
            maxLength: 11,
            nullable: true,
            oldClrType: typeof(string),
            oldType: "character varying(50)",
            oldMaxLength: 50,
            oldNullable: true);

        migrationBuilder.AddCheckConstraint(
            name: "CK_Customers_TaxNumber_Valid",
            table: "Customers",
            sql: "\"TaxNumber\" IS NULL OR \"TaxNumber\" ~ '^[0-9]{10,11}$'");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropCheckConstraint(
            name: "CK_Customers_TaxNumber_Valid",
            table: "Customers");

        migrationBuilder.AlterColumn<string>(
            name: "TaxNumber",
            table: "Customers",
            type: "character varying(50)",
            maxLength: 50,
            nullable: true,
            oldClrType: typeof(string),
            oldType: "character varying(11)",
            oldMaxLength: 11,
            oldNullable: true);
    }
}
