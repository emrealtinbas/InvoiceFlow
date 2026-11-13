using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Invoices;
using InvoiceFlow.IntegrationTests.Persistence;

namespace InvoiceFlow.IntegrationTests;

/// <summary>
/// Complete user journeys that cross authentication, customers, invoices, lifecycle,
/// authorization, and optimistic concurrency. The per-behavior tests remain the first
/// line of defense; these tests prove the workflows hold together end to end.
/// </summary>
[Collection(PostgresDatabaseGroup.Name)]
public sealed class EndToEndWorkflowTests(PostgresContainerFixture fixture) : InvoiceTestBase(fixture)
{
    [Fact]
    public async Task UserJourney_FromRegistrationToPaidInvoice_EnforcesTerminalState()
    {
        const string email = "journey-user@example.com";

        var registered = await RegisterAsync(email);
        var login = await LoginAsync(email);

        using (var meResponse = await SendWithTokenAsync(
            HttpMethod.Get,
            "/api/auth/me",
            login.AccessToken))
        {
            Assert.Equal(HttpStatusCode.OK, meResponse.StatusCode);

            var me = await meResponse.Content.ReadFromJsonAsync<MeResponse>();

            Assert.NotNull(me);
            Assert.Equal(registered.Id, me.Id);
            Assert.Equal(email, me.Email);
            Assert.Contains(AuthRoles.User, me.Roles);
        }

        var customer = await CreateCustomerAsync(
            login.AccessToken,
            name: "Journey Customer",
            email: "billing@journey.example");

        var created = await CreateInvoiceAsync(
            login.AccessToken,
            customer.Id,
            items:
            [
                new { description = "Design", quantity = 2m, unitPrice = 100m, taxRate = 10m },
                new { description = "Development", quantity = 1.5m, unitPrice = 200m, taxRate = 20m },
            ]);

        Assert.Equal(InvoiceStatus.Draft, created.Status);
        Assert.Equal(500m, created.Subtotal);
        Assert.Equal(80m, created.TaxTotal);
        Assert.Equal(580m, created.GrandTotal);
        Assert.Equal(2, created.Items.Count);

        var fetched = await GetInvoiceAsync(login.AccessToken, created.Id);

        Assert.Equal(created.InvoiceNumber, fetched.InvoiceNumber);
        Assert.Equal(created.Subtotal, fetched.Subtotal);
        Assert.Equal(created.TaxTotal, fetched.TaxTotal);
        Assert.Equal(created.GrandTotal, fetched.GrandTotal);

        var updatedItems = new object[]
        {
            new { description = "Updated design", quantity = 3m, unitPrice = 100m, taxRate = 10m },
            new { description = "Updated development", quantity = 2m, unitPrice = 200m, taxRate = 20m },
        };

        using var updateResponse = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/invoices/{created.Id}",
            login.AccessToken,
            ValidUpdateBody(customer.Id, created.ConcurrencyToken, updatedItems));

        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);

        var updated = await ReadInvoiceAsync(updateResponse);

        Assert.Equal(700m, updated.Subtotal);
        Assert.Equal(110m, updated.TaxTotal);
        Assert.Equal(810m, updated.GrandTotal);
        Assert.Equal(2, updated.Items.Count);

        using var sendResponse = await PostLifecycleAsync(
            login.AccessToken,
            created.Id,
            "send",
            updated.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.OK, sendResponse.StatusCode);

        var sent = await ReadInvoiceAsync(sendResponse);

        Assert.Equal(InvoiceStatus.Sent, sent.Status);

        using var paidResponse = await PostLifecycleAsync(
            login.AccessToken,
            created.Id,
            "mark-paid",
            sent.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.OK, paidResponse.StatusCode);

        var paid = await ReadInvoiceAsync(paidResponse);

        Assert.Equal(InvoiceStatus.Paid, paid.Status);

        using var updatePaid = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/invoices/{created.Id}",
            login.AccessToken,
            ValidUpdateBody(customer.Id, paid.ConcurrencyToken));

        Assert.Equal(HttpStatusCode.Conflict, updatePaid.StatusCode);

        using var deletePaid = await SendWithTokenAsync(
            HttpMethod.Delete,
            $"/api/invoices/{created.Id}" +
                $"?concurrencyToken={Uri.EscapeDataString(paid.ConcurrencyToken)}",
            login.AccessToken);

        Assert.Equal(HttpStatusCode.Conflict, deletePaid.StatusCode);

        var stored = await FindInvoiceAsync(created.Id);

        Assert.NotNull(stored);
        Assert.Equal(InvoiceStatus.Paid, stored.Status);
        Assert.Equal(810m, stored.GrandTotal);
        Assert.Equal(2, stored.Items.Count);
    }

    [Fact]
    public async Task CancellationJourney_DraftAndSentInvoicesReachTerminalState()
    {
        const string email = "journey-cancel@example.com";

        await RegisterAsync(email);
        var login = await LoginAsync(email);
        var customer = await CreateCustomerAsync(
            login.AccessToken,
            name: "Cancellation Customer",
            email: "billing@cancel.example");

        var draft = await CreateInvoiceAsync(login.AccessToken, customer.Id);

        using var cancelDraftResponse = await PostLifecycleAsync(
            login.AccessToken,
            draft.Id,
            "cancel",
            draft.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.OK, cancelDraftResponse.StatusCode);

        var cancelledDraft = await ReadInvoiceAsync(cancelDraftResponse);

        Assert.Equal(InvoiceStatus.Cancelled, cancelledDraft.Status);

        using var sendCancelledDraft = await PostLifecycleAsync(
            login.AccessToken,
            draft.Id,
            "send",
            cancelledDraft.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.Conflict, sendCancelledDraft.StatusCode);

        using var updateCancelledDraft = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/invoices/{draft.Id}",
            login.AccessToken,
            ValidUpdateBody(customer.Id, cancelledDraft.ConcurrencyToken));

        Assert.Equal(HttpStatusCode.Conflict, updateCancelledDraft.StatusCode);

        using var deleteCancelledDraft = await SendWithTokenAsync(
            HttpMethod.Delete,
            $"/api/invoices/{draft.Id}" +
                $"?concurrencyToken={Uri.EscapeDataString(cancelledDraft.ConcurrencyToken)}",
            login.AccessToken);

        Assert.Equal(HttpStatusCode.Conflict, deleteCancelledDraft.StatusCode);

        var second = await CreateInvoiceAsync(login.AccessToken, customer.Id);

        Assert.NotEqual(draft.InvoiceNumber, second.InvoiceNumber);

        using var sendResponse = await PostLifecycleAsync(
            login.AccessToken,
            second.Id,
            "send",
            second.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.OK, sendResponse.StatusCode);

        var sent = await ReadInvoiceAsync(sendResponse);

        Assert.Equal(InvoiceStatus.Sent, sent.Status);

        using var cancelSentResponse = await PostLifecycleAsync(
            login.AccessToken,
            second.Id,
            "cancel",
            sent.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.OK, cancelSentResponse.StatusCode);

        var cancelledSent = await ReadInvoiceAsync(cancelSentResponse);

        Assert.Equal(InvoiceStatus.Cancelled, cancelledSent.Status);

        using var sendCancelledSent = await PostLifecycleAsync(
            login.AccessToken,
            second.Id,
            "send",
            cancelledSent.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.Conflict, sendCancelledSent.StatusCode);

        using var payCancelledSent = await PostLifecycleAsync(
            login.AccessToken,
            second.Id,
            "mark-paid",
            cancelledSent.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.Conflict, payCancelledSent.StatusCode);

        Assert.Equal(InvoiceStatus.Cancelled, (await FindInvoiceAsync(draft.Id))!.Status);
        Assert.Equal(InvoiceStatus.Cancelled, (await FindInvoiceAsync(second.Id))!.Status);
    }

    [Fact]
    public async Task AuthorizationJourney_OtherUserCannotAccessResourcesAndAdminCanRead()
    {
        var (owner, ownerToken) = await CreateUserWithTokenAsync("journey-owner@example.com");
        var (_, otherToken) = await CreateUserWithTokenAsync("journey-other@example.com");
        var (_, adminToken) = await CreateUserWithTokenAsync(
            "journey-admin@example.com",
            AuthRoles.Admin);

        var customer = await CreateCustomerAsync(
            ownerToken,
            name: "Owner Customer",
            email: "billing@owner.example");
        var invoice = await CreateInvoiceAsync(ownerToken, customer.Id);

        using var read = await SendWithTokenAsync(
            HttpMethod.Get,
            $"/api/invoices/{invoice.Id}",
            otherToken);

        Assert.Equal(HttpStatusCode.NotFound, read.StatusCode);

        using var update = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/invoices/{invoice.Id}",
            otherToken,
            ValidUpdateBody(customer.Id, invoice.ConcurrencyToken));

        Assert.Equal(HttpStatusCode.NotFound, update.StatusCode);

        using var delete = await SendWithTokenAsync(
            HttpMethod.Delete,
            $"/api/invoices/{invoice.Id}" +
                $"?concurrencyToken={Uri.EscapeDataString(invoice.ConcurrencyToken)}",
            otherToken);

        Assert.Equal(HttpStatusCode.NotFound, delete.StatusCode);

        using var transition = await PostLifecycleAsync(
            otherToken,
            invoice.Id,
            "send",
            invoice.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.NotFound, transition.StatusCode);

        using var createForOtherCustomer = await SendJsonAsync(
            HttpMethod.Post,
            "/api/invoices",
            otherToken,
            new
            {
                customerId = customer.Id,
                issueDate = IssueDate,
                dueDate = DueDate,
                items = new[]
                {
                    new { description = "Unauthorized", quantity = 1m, unitPrice = 10m, taxRate = 0m },
                },
            });

        Assert.Equal(HttpStatusCode.NotFound, createForOtherCustomer.StatusCode);

        using var adminRead = await SendWithTokenAsync(
            HttpMethod.Get,
            $"/api/invoices/{invoice.Id}",
            adminToken);

        Assert.Equal(HttpStatusCode.OK, adminRead.StatusCode);

        var stored = await FindInvoiceAsync(invoice.Id);

        Assert.NotNull(stored);
        Assert.Equal(owner.Id, stored.OwnerId);
        Assert.Equal(InvoiceStatus.Draft, stored.Status);
    }

    [Fact]
    public async Task ConcurrencyJourney_StaleUpdateAfterSuccessfulUpdateKeepsFirstChange()
    {
        var (owner, token) = await CreateUserWithTokenAsync("journey-concurrency@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Concurrency Customer", email: null);
        var created = await CreateInvoiceAsync(token, customer.Id);

        var firstItems = new object[]
        {
            new { description = "First update", quantity = 1m, unitPrice = 100m, taxRate = 0m },
        };

        using var firstUpdate = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/invoices/{created.Id}",
            token,
            ValidUpdateBody(customer.Id, created.ConcurrencyToken, firstItems));

        Assert.Equal(HttpStatusCode.OK, firstUpdate.StatusCode);

        var updated = await ReadInvoiceAsync(firstUpdate);

        var staleItems = new object[]
        {
            new { description = "Stale update", quantity = 9m, unitPrice = 999m, taxRate = 20m },
        };

        using var staleUpdate = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/invoices/{created.Id}",
            token,
            ValidUpdateBody(customer.Id, created.ConcurrencyToken, staleItems));

        Assert.Equal(HttpStatusCode.Conflict, staleUpdate.StatusCode);

        var stored = await FindInvoiceAsync(created.Id);

        Assert.NotNull(stored);
        Assert.Equal(100m, stored.Subtotal);
        Assert.Equal(0m, stored.TaxTotal);
        Assert.Equal(100m, stored.GrandTotal);
        Assert.Single(stored.Items);
        Assert.Equal("First update", stored.Items.Single().Description);
        Assert.True(InvoiceConcurrencyToken.TryDecode(updated.ConcurrencyToken, out var updatedVersion));
        Assert.Equal(stored.Version, updatedVersion);
    }

    private Task<HttpResponseMessage> PostLifecycleAsync(
        string token,
        Guid invoiceId,
        string action,
        string concurrencyToken) =>
        SendJsonAsync(
            HttpMethod.Post,
            $"/api/invoices/{invoiceId}/{action}",
            token,
            new { concurrencyToken });

    private static async Task<InvoiceResponse> ReadInvoiceAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadFromJsonAsync<InvoiceResponse>();

        Assert.NotNull(payload);
        return payload;
    }
}
