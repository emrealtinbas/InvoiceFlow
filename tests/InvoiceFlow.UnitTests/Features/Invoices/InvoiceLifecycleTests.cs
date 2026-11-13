using InvoiceFlow.Api.Features.Invoices;

namespace InvoiceFlow.UnitTests.Features.Invoices;

public sealed class InvoiceLifecycleTests
{
    private readonly InvoiceLifecycle _lifecycle = new();

    [Fact]
    public void DraftToSent_IsAllowed() =>
        Assert.True(_lifecycle.CanTransition(InvoiceStatus.Draft, InvoiceStatus.Sent));

    [Fact]
    public void SentToPaid_IsAllowed() =>
        Assert.True(_lifecycle.CanTransition(InvoiceStatus.Sent, InvoiceStatus.Paid));

    [Fact]
    public void DraftToCancelled_IsAllowed() =>
        Assert.True(_lifecycle.CanTransition(InvoiceStatus.Draft, InvoiceStatus.Cancelled));

    [Fact]
    public void SentToCancelled_IsAllowed() =>
        Assert.True(_lifecycle.CanTransition(InvoiceStatus.Sent, InvoiceStatus.Cancelled));

    [Fact]
    public void DraftToPaid_IsRejected() =>
        Assert.False(_lifecycle.CanTransition(InvoiceStatus.Draft, InvoiceStatus.Paid));

    [Fact]
    public void SentToDraft_IsRejected() =>
        Assert.False(_lifecycle.CanTransition(InvoiceStatus.Sent, InvoiceStatus.Draft));

    [Fact]
    public void PaidToCancelled_IsRejected() =>
        Assert.False(_lifecycle.CanTransition(InvoiceStatus.Paid, InvoiceStatus.Cancelled));

    [Fact]
    public void CancelledToDraft_IsRejected() =>
        Assert.False(_lifecycle.CanTransition(InvoiceStatus.Cancelled, InvoiceStatus.Draft));

    [Theory]
    [InlineData(InvoiceStatus.Draft)]
    [InlineData(InvoiceStatus.Sent)]
    [InlineData(InvoiceStatus.Paid)]
    [InlineData(InvoiceStatus.Cancelled)]
    public void RepeatingTransition_IsRejected(InvoiceStatus status) =>
        Assert.False(_lifecycle.CanTransition(status, status));

    [Theory]
    [InlineData(InvoiceStatus.Draft)]
    [InlineData(InvoiceStatus.Sent)]
    [InlineData(InvoiceStatus.Cancelled)]
    public void Paid_IsTerminal(InvoiceStatus target) =>
        Assert.False(_lifecycle.CanTransition(InvoiceStatus.Paid, target));

    [Theory]
    [InlineData(InvoiceStatus.Draft)]
    [InlineData(InvoiceStatus.Sent)]
    [InlineData(InvoiceStatus.Paid)]
    public void Cancelled_IsTerminal(InvoiceStatus target) =>
        Assert.False(_lifecycle.CanTransition(InvoiceStatus.Cancelled, target));

    [Fact]
    public void Validation_DoesNotMutateInvoiceFields()
    {
        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            OwnerId = Guid.NewGuid(),
            CustomerId = Guid.NewGuid(),
            InvoiceNumber = "INV-2026-000001",
            IssueDate = new DateOnly(2026, 11, 12),
            DueDate = new DateOnly(2026, 11, 26),
            Status = InvoiceStatus.Draft,
            Currency = "TRY",
            Subtotal = 100m,
            TaxTotal = 20m,
            GrandTotal = 120m,
            CreatedAt = DateTime.UtcNow,
        };

        var allowed = _lifecycle.CanTransition(invoice.Status, InvoiceStatus.Sent);

        Assert.True(allowed);
        Assert.Equal(InvoiceStatus.Draft, invoice.Status);
        Assert.Equal("INV-2026-000001", invoice.InvoiceNumber);
        Assert.Equal(100m, invoice.Subtotal);
        Assert.Equal(20m, invoice.TaxTotal);
        Assert.Equal(120m, invoice.GrandTotal);
    }
}
