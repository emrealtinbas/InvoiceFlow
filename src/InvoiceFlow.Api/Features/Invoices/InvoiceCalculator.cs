namespace InvoiceFlow.Api.Features.Invoices;

/// <summary>
/// Pure decimal financial calculator. Values are rounded per line before invoice totals
/// are accumulated, so persisted totals always equal the sum of displayed line amounts.
/// </summary>
public sealed class InvoiceCalculator
{
    public InvoiceCalculation Calculate(IReadOnlyCollection<InvoiceCalculationInput> inputs)
    {
        ArgumentNullException.ThrowIfNull(inputs);

        var lines = new List<InvoiceLineCalculation>(inputs.Count);
        var subtotal = 0m;
        var taxTotal = 0m;

        try
        {
            foreach (var input in inputs)
            {
                var lineSubtotal = Round(checked(input.Quantity * input.UnitPrice));
                EnsureMoneyFits(lineSubtotal);

                var lineTax = Round(checked(lineSubtotal * input.TaxRate / 100m));
                EnsureMoneyFits(lineTax);

                var lineTotal = checked(lineSubtotal + lineTax);
                EnsureMoneyFits(lineTotal);

                subtotal = checked(subtotal + lineSubtotal);
                taxTotal = checked(taxTotal + lineTax);
                EnsureMoneyFits(subtotal);
                EnsureMoneyFits(taxTotal);

                lines.Add(new InvoiceLineCalculation(lineSubtotal, lineTax, lineTotal));
            }

            var grandTotal = checked(subtotal + taxTotal);
            EnsureMoneyFits(grandTotal);

            return new InvoiceCalculation(lines, subtotal, taxTotal, grandTotal);
        }
        catch (OverflowException exception)
        {
            throw new InvoiceCalculationException(
                "The calculated invoice values exceed the supported financial range.",
                exception);
        }
    }

    private static decimal Round(decimal value) =>
        Math.Round(value, 2, MidpointRounding.AwayFromZero);

    private static void EnsureMoneyFits(decimal value)
    {
        if (value < 0m || value > InvoiceFinancialLimits.MaximumMoney)
        {
            throw new InvoiceCalculationException(
                "The calculated invoice values exceed the supported financial range.");
        }
    }
}

public sealed record InvoiceCalculationInput(decimal Quantity, decimal UnitPrice, decimal TaxRate);

public sealed record InvoiceLineCalculation(decimal LineSubtotal, decimal LineTax, decimal LineTotal);

public sealed record InvoiceCalculation(
    IReadOnlyList<InvoiceLineCalculation> Lines,
    decimal Subtotal,
    decimal TaxTotal,
    decimal GrandTotal);

public static class InvoiceFinancialLimits
{
    public const decimal MaximumMoney = 9999999999999999.99m;

    public const decimal MaximumQuantity = 999999999999999.999m;
}

public sealed class InvoiceCalculationException : Exception
{
    public InvoiceCalculationException(string message)
        : base(message)
    {
    }

    public InvoiceCalculationException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
