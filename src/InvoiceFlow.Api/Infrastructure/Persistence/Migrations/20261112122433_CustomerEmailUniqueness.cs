using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace InvoiceFlow.Api.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CustomerEmailUniqueness : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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

            // Refuse to create the index when existing data already violates per-owner
            // uniqueness. The migration fails with a clear message instead of silently
            // deleting or rewriting customer data.
            migrationBuilder.Sql(
                """
                DO $$
                DECLARE
                    duplicate_groups integer;
                BEGIN
                    SELECT count(*) INTO duplicate_groups
                    FROM (
                        SELECT "OwnerId", lower("Email")
                        FROM "Customers"
                        WHERE "Email" IS NOT NULL
                        GROUP BY "OwnerId", lower("Email")
                        HAVING count(*) > 1
                    ) AS duplicates;

                    IF duplicate_groups > 0 THEN
                        RAISE EXCEPTION
                            'Cannot create the per-owner customer e-mail unique index: % duplicate (owner, e-mail) group(s) exist. Resolve them manually before applying this migration.',
                            duplicate_groups;
                    END IF;
                END $$;
                """);

            // Case-insensitive, per-owner uniqueness. PostgreSQL treats NULL values as
            // distinct, so any number of customers may have no e-mail address.
            migrationBuilder.Sql(
                """
                CREATE UNIQUE INDEX "UX_Customers_OwnerId_Email_Lower"
                ON "Customers" ("OwnerId", lower("Email"))
                WHERE "Email" IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """DROP INDEX IF EXISTS "UX_Customers_OwnerId_Email_Lower";""");

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
        }
    }
}
