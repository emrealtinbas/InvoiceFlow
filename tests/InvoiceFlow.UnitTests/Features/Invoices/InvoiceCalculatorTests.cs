using InvoiceFlow.Api.Features.Invoices;

namespace InvoiceFlow.UnitTests.Features.Invoices;

public sealed class InvoiceCalculatorTests
{
    private readonly InvoiceCalculator _calculator = new();

    [Fact]
    public void SingleItemWithoutTax_CalculatesTotals()
    {
        var result = Calculate(2m, 125m, 0m);

        Assert.Equal(250m, result.Subtotal);
        Assert.Equal(0m, result.TaxTotal);
        Assert.Equal(250m, result.GrandTotal);
    }

    [Fact]
    public void SingleItemWithTax_CalculatesDocumentedExample()
    {
        var result = Calculate(3m, 199.99m, 20m);
        var line = Assert.Single(result.Lines);

        Assert.Equal(599.97m, line.LineSubtotal);
        Assert.Equal(119.99m, line.LineTax);
        Assert.Equal(719.96m, line.LineTotal);
        Assert.Equal(719.96m, result.GrandTotal);
    }

    [Fact]
    public void MultipleItems_SumsRoundedLines()
    {
        var result = _calculator.Calculate(
        [
            new(10m, 1500m, 20m),
            new(2m, 750m, 20m),
        ]);

        Assert.Equal(16500m, result.Subtotal);
        Assert.Equal(3300m, result.TaxTotal);
        Assert.Equal(19800m, result.GrandTotal);
    }

    [Fact]
    public void FractionalQuantity_IsCalculatedWithDecimalArithmetic()
    {
        var result = Calculate(1.125m, 80m, 20m);

        Assert.Equal(90m, result.Subtotal);
        Assert.Equal(18m, result.TaxTotal);
        Assert.Equal(108m, result.GrandTotal);
    }

    [Fact]
    public void ZeroTaxRate_ProducesZeroTax()
    {
        var result = Calculate(1m, 99.99m, 0m);

        Assert.Equal(0m, result.Lines[0].LineTax);
    }

    [Fact]
    public void ZeroUnitPrice_ProducesZeroTotals()
    {
        var result = Calculate(10m, 0m, 100m);

        Assert.Equal(0m, result.Subtotal);
        Assert.Equal(0m, result.TaxTotal);
        Assert.Equal(0m, result.GrandTotal);
    }

    [Fact]
    public void MidpointRounding_IsAwayFromZero()
    {
        var result = Calculate(1m, 0.005m, 0m);

        Assert.Equal(0.01m, result.Lines[0].LineSubtotal);
    }

    [Fact]
    public void Rounding_IsAppliedPerLineBeforeSumming()
    {
        var result = _calculator.Calculate(
        [
            new(1m, 0.005m, 0m),
            new(1m, 0.005m, 0m),
        ]);

        Assert.Equal(0.02m, result.Subtotal);
    }

    [Fact]
    public void InvoiceTotals_EqualSumsOfLineAmounts()
    {
        var result = _calculator.Calculate(
        [
            new(3m, 19.99m, 20m),
            new(1.125m, 40.25m, 10m),
            new(2m, 0m, 0m),
        ]);

        Assert.Equal(result.Lines.Sum(line => line.LineSubtotal), result.Subtotal);
        Assert.Equal(result.Lines.Sum(line => line.LineTax), result.TaxTotal);
        Assert.Equal(result.Lines.Sum(line => line.LineTotal), result.GrandTotal);
    }

    [Fact]
    public void MaximumMoneyValue_IsAccepted()
    {
        var result = Calculate(1m, InvoiceFinancialLimits.MaximumMoney, 0m);

        Assert.Equal(InvoiceFinancialLimits.MaximumMoney, result.GrandTotal);
    }

    [Fact]
    public void ValueExceedingDatabasePrecision_IsRejected()
    {
        Assert.Throws<InvoiceCalculationException>(() =>
            Calculate(2m, InvoiceFinancialLimits.MaximumMoney, 0m));
    }

    [Fact]
    public void RepeatedCalculation_IsDeterministic()
    {
        InvoiceCalculationInput[] inputs =
        [
            new(3m, 199.99m, 20m),
            new(1.125m, 12.34m, 8.5m),
        ];

        var first = _calculator.Calculate(inputs);
        var second = _calculator.Calculate(inputs);

        Assert.Equal(first.Subtotal, second.Subtotal);
        Assert.Equal(first.TaxTotal, second.TaxTotal);
        Assert.Equal(first.GrandTotal, second.GrandTotal);
        Assert.Equal(first.Lines, second.Lines);
    }

    [Fact]
    public void ConcurrencyToken_RoundTripsWithoutExposingNumericVersion()
    {
        const uint version = 123456;

        var token = InvoiceConcurrencyToken.Encode(version);
        var decoded = InvoiceConcurrencyToken.TryDecode(token, out var result);

        Assert.True(decoded);
        Assert.Equal(version, result);
        Assert.NotEqual(version.ToString(System.Globalization.CultureInfo.InvariantCulture), token);
    }

    private InvoiceCalculation Calculate(decimal quantity, decimal unitPrice, decimal taxRate) =>
        _calculator.Calculate([new(quantity, unitPrice, taxRate)]);
}
