using System.Net;
using System.Net.Http.Json;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Invoices;
using InvoiceFlow.IntegrationTests.Persistence;

namespace InvoiceFlow.IntegrationTests;

[Collection(PostgresDatabaseGroup.Name)]
public sealed class InvoiceLifecycleTests(PostgresContainerFixture fixture) : InvoiceTestBase(fixture)
{
    [Fact]
    public async Task SendThenMarkPaid_UsesFreshTokensAndPreservesInvoiceData()
    {
        var (owner, token) = await CreateUserWithTokenAsync("lifecycle-paid@example.com");
        var customer = await CreateCustomerDirectlyAsync(
            owner.Id,
            "Lifecycle Customer",
            email: "billing@lifecycle.example");
        var created = await CreateInvoiceAsync(token, customer.Id);

        using var sendResponse = await PostLifecycleAsync(
            token,
            created.Id,
            "send",
            created.ConcurrencyToken);
        Assert.Equal(HttpStatusCode.OK, sendResponse.StatusCode);
        var sent = await ReadInvoiceAsync(sendResponse);

        Assert.Equal(InvoiceStatus.Sent, sent.Status);
        Assert.NotEqual(created.ConcurrencyToken, sent.ConcurrencyToken);
        Assert.NotNull(sent.UpdatedAt);
        Assert.True(sent.UpdatedAt >= sent.CreatedAt);
        AssertInvoiceBusinessDataUnchanged(created, sent);

        using var paidResponse = await PostLifecycleAsync(
            token,
            created.Id,
            "mark-paid",
            sent.ConcurrencyToken);
        Assert.Equal(HttpStatusCode.OK, paidResponse.StatusCode);
        var paid = await ReadInvoiceAsync(paidResponse);

        Assert.Equal(InvoiceStatus.Paid, paid.Status);
        Assert.NotEqual(sent.ConcurrencyToken, paid.ConcurrencyToken);
        AssertInvoiceBusinessDataUnchanged(created, paid);
    }

    [Fact]
    public async Task Cancel_DraftToCancelled_Succeeds()
    {
        var (owner, token) = await CreateUserWithTokenAsync("lifecycle-cancel-draft@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Cancel Draft", email: null);
        var created = await CreateInvoiceAsync(token, customer.Id);

        using var response = await PostLifecycleAsync(
            token,
            created.Id,
            "cancel",
            created.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cancelled = await ReadInvoiceAsync(response);
        Assert.Equal(InvoiceStatus.Cancelled, cancelled.Status);
        AssertInvoiceBusinessDataUnchanged(created, cancelled);
    }

    [Fact]
    public async Task Cancel_SentToCancelled_Succeeds()
    {
        var (owner, token) = await CreateUserWithTokenAsync("lifecycle-cancel-sent@example.com");
        var customer = await CreateCustomerDirectlyAsync(
            owner.Id,
            "Cancel Sent",
            email: "billing@cancel.example");
        var created = await CreateInvoiceAsync(token, customer.Id);

        using var sendResponse = await PostLifecycleAsync(
            token,
            created.Id,
            "send",
            created.ConcurrencyToken);
        var sent = await ReadInvoiceAsync(sendResponse);

        using var cancelResponse = await PostLifecycleAsync(
            token,
            created.Id,
            "cancel",
            sent.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.OK, cancelResponse.StatusCode);
        var cancelled = await ReadInvoiceAsync(cancelResponse);
        Assert.Equal(InvoiceStatus.Cancelled, cancelled.Status);
        AssertInvoiceBusinessDataUnchanged(created, cancelled);
    }

    [Fact]
    public async Task MarkPaid_FromDraft_ReturnsConflictAndPreservesState()
    {
        var (owner, token) = await CreateUserWithTokenAsync("lifecycle-draft-paid@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "Draft Paid", email: null);
        var created = await CreateInvoiceAsync(token, customer.Id);

        using var response = await PostLifecycleAsync(
            token,
            created.Id,
            "mark-paid",
            created.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(InvoiceStatus.Draft, (await FindInvoiceAsync(created.Id))!.Status);
    }

    [Fact]
    public async Task Cancel_FromPaid_ReturnsConflictAndPreservesState()
    {
        var (token, paid) = await CreatePaidInvoiceAsync("lifecycle-paid-cancel@example.com");

        using var response = await PostLifecycleAsync(
            token,
            paid.Id,
            "cancel",
            paid.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(InvoiceStatus.Paid, (await FindInvoiceAsync(paid.Id))!.Status);
    }

    [Fact]
    public async Task Send_FromCancelled_ReturnsConflictAndPreservesState()
    {
        var (owner, token) = await CreateUserWithTokenAsync("lifecycle-cancelled-send@example.com");
        var customer = await CreateCustomerDirectlyAsync(
            owner.Id,
            "Cancelled Send",
            email: "billing@cancelled.example");
        var created = await CreateInvoiceAsync(token, customer.Id);
        using var cancelResponse = await PostLifecycleAsync(
            token,
            created.Id,
            "cancel",
            created.ConcurrencyToken);
        var cancelled = await ReadInvoiceAsync(cancelResponse);

        using var response = await PostLifecycleAsync(
            token,
            created.Id,
            "send",
            cancelled.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(InvoiceStatus.Cancelled, (await FindInvoiceAsync(created.Id))!.Status);
    }

    [Fact]
    public async Task Send_RepeatedTransition_ReturnsConflict()
    {
        var (owner, token) = await CreateUserWithTokenAsync("lifecycle-repeat@example.com");
        var customer = await CreateCustomerDirectlyAsync(
            owner.Id,
            "Repeat Send",
            email: "billing@repeat.example");
        var created = await CreateInvoiceAsync(token, customer.Id);
        using var firstResponse = await PostLifecycleAsync(
            token,
            created.Id,
            "send",
            created.ConcurrencyToken);
        var sent = await ReadInvoiceAsync(firstResponse);

        using var repeatedResponse = await PostLifecycleAsync(
            token,
            created.Id,
            "send",
            sent.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.Conflict, repeatedResponse.StatusCode);
        Assert.Equal(InvoiceStatus.Sent, (await FindInvoiceAsync(created.Id))!.Status);
    }

    [Fact]
    public async Task Send_WithoutCustomerEmail_ReturnsConflict()
    {
        var (owner, token) = await CreateUserWithTokenAsync("lifecycle-email@example.com");
        var customer = await CreateCustomerDirectlyAsync(owner.Id, "No Email", email: null);
        var created = await CreateInvoiceAsync(token, customer.Id);

        using var response = await PostLifecycleAsync(
            token,
            created.Id,
            "send",
            created.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(InvoiceStatus.Draft, (await FindInvoiceAsync(created.Id))!.Status);
    }

    [Fact]
    public async Task Lifecycle_OtherUserReceivesNotFoundAndInvoiceIsUnchanged()
    {
        var (owner, ownerToken) = await CreateUserWithTokenAsync("lifecycle-owner@example.com");
        var (_, otherToken) = await CreateUserWithTokenAsync("lifecycle-other@example.com");
        var customer = await CreateCustomerDirectlyAsync(
            owner.Id,
            "Private Lifecycle",
            email: "billing@private.example");
        var created = await CreateInvoiceAsync(ownerToken, customer.Id);

        using var response = await PostLifecycleAsync(
            otherToken,
            created.Id,
            "send",
            created.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(InvoiceStatus.Draft, (await FindInvoiceAsync(created.Id))!.Status);
    }

    [Fact]
    public async Task Lifecycle_NonexistentInvoiceReturnsNotFound()
    {
        var (_, token) = await CreateUserWithTokenAsync("lifecycle-missing@example.com");

        using var response = await PostLifecycleAsync(
            token,
            Guid.NewGuid(),
            "send",
            InvoiceConcurrencyToken.Encode(1));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Lifecycle_SentInvoiceCannotBeChangedBackToDraftThroughUpdate()
    {
        var (owner, token) = await CreateUserWithTokenAsync("lifecycle-sent-draft@example.com");
        var customer = await CreateCustomerDirectlyAsync(
            owner.Id,
            "Sent Draft",
            email: "billing@sent-draft.example");
        var created = await CreateInvoiceAsync(token, customer.Id);
        using var sendResponse = await PostLifecycleAsync(
            token,
            created.Id,
            "send",
            created.ConcurrencyToken);
        var sent = await ReadInvoiceAsync(sendResponse);

        using var response = await SendJsonAsync(
            HttpMethod.Put,
            $"/api/invoices/{created.Id}",
            token,
            new
            {
                customerId = customer.Id,
                issueDate = sent.IssueDate,
                dueDate = sent.DueDate,
                status = "Draft",
                concurrencyToken = sent.ConcurrencyToken,
                items = new[]
                {
                    new { description = "Unchanged", quantity = 1m, unitPrice = 10m, taxRate = 0m },
                },
            });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(InvoiceStatus.Sent, (await FindInvoiceAsync(created.Id))!.Status);
    }

    [Fact]
    public async Task Lifecycle_AdminCanTransitionAnotherUsersInvoice()
    {
        var (owner, ownerToken) = await CreateUserWithTokenAsync("lifecycle-admin-owner@example.com");
        var (_, adminToken) = await CreateUserWithTokenAsync("lifecycle-admin@example.com", AuthRoles.Admin);
        var customer = await CreateCustomerDirectlyAsync(
            owner.Id,
            "Admin Lifecycle",
            email: "billing@admin-lifecycle.example");
        var created = await CreateInvoiceAsync(ownerToken, customer.Id);

        using var response = await PostLifecycleAsync(
            adminToken,
            created.Id,
            "send",
            created.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(InvoiceStatus.Sent, (await ReadInvoiceAsync(response)).Status);
    }

    [Fact]
    public async Task Lifecycle_AnonymousRequestReturnsUnauthorizedAndDoesNotModifyInvoice()
    {
        var (owner, ownerToken) = await CreateUserWithTokenAsync("lifecycle-anonymous@example.com");
        var customer = await CreateCustomerDirectlyAsync(
            owner.Id,
            "Anonymous Lifecycle",
            email: "billing@anonymous.example");
        var created = await CreateInvoiceAsync(ownerToken, customer.Id);

        using var response = await SendJsonAsync(
            HttpMethod.Post,
            $"/api/invoices/{created.Id}/send",
            token: null,
            new { concurrencyToken = created.ConcurrencyToken });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(InvoiceStatus.Draft, (await FindInvoiceAsync(created.Id))!.Status);
    }

    [Fact]
    public async Task Lifecycle_MissingAndMalformedTokensReturnBadRequest()
    {
        var (owner, token) = await CreateUserWithTokenAsync("lifecycle-token-validation@example.com");
        var customer = await CreateCustomerDirectlyAsync(
            owner.Id,
            "Token Validation",
            email: "billing@token.example");
        var created = await CreateInvoiceAsync(token, customer.Id);

        using var missing = await SendJsonAsync(
            HttpMethod.Post,
            $"/api/invoices/{created.Id}/send",
            token,
            new { });
        using var malformed = await SendJsonAsync(
            HttpMethod.Post,
            $"/api/invoices/{created.Id}/send",
            token,
            new { concurrencyToken = "not-base64" });

        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, malformed.StatusCode);
        Assert.Equal(InvoiceStatus.Draft, (await FindInvoiceAsync(created.Id))!.Status);
    }

    [Fact]
    public async Task Lifecycle_StaleTokenReturnsConflict()
    {
        var (owner, token) = await CreateUserWithTokenAsync("lifecycle-stale@example.com");
        var customer = await CreateCustomerDirectlyAsync(
            owner.Id,
            "Stale Lifecycle",
            email: "billing@stale.example");
        var created = await CreateInvoiceAsync(token, customer.Id);
        await TouchInvoiceAsync(created.Id);

        using var response = await PostLifecycleAsync(
            token,
            created.Id,
            "send",
            created.ConcurrencyToken);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(InvoiceStatus.Draft, (await FindInvoiceAsync(created.Id))!.Status);
    }

    [Fact]
    public async Task Lifecycle_ConcurrentRequestsWithSameToken_CannotBothSucceed()
    {
        var (owner, token) = await CreateUserWithTokenAsync("lifecycle-concurrent@example.com");
        var customer = await CreateCustomerDirectlyAsync(
            owner.Id,
            "Concurrent Lifecycle",
            email: "billing@concurrent.example");
        var created = await CreateInvoiceAsync(token, customer.Id);

        var requests = new[]
        {
            PostLifecycleAsync(token, created.Id, "send", created.ConcurrencyToken),
            PostLifecycleAsync(token, created.Id, "send", created.ConcurrencyToken),
        };
        var responses = await Task.WhenAll(requests);

        try
        {
            Assert.Equal(
                [HttpStatusCode.OK, HttpStatusCode.Conflict],
                responses.Select(response => response.StatusCode).OrderBy(status => status));
            Assert.Equal(InvoiceStatus.Sent, (await FindInvoiceAsync(created.Id))!.Status);
        }
        finally
        {
            foreach (var response in responses)
            {
                response.Dispose();
            }
        }
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

    private async Task<(string Token, InvoiceResponse Invoice)> CreatePaidInvoiceAsync(string email)
    {
        var (owner, token) = await CreateUserWithTokenAsync(email);
        var customer = await CreateCustomerDirectlyAsync(
            owner.Id,
            "Paid Lifecycle",
            email: "billing@paid.example");
        var created = await CreateInvoiceAsync(token, customer.Id);
        using var sendResponse = await PostLifecycleAsync(
            token,
            created.Id,
            "send",
            created.ConcurrencyToken);
        var sent = await ReadInvoiceAsync(sendResponse);
        using var paidResponse = await PostLifecycleAsync(
            token,
            created.Id,
            "mark-paid",
            sent.ConcurrencyToken);
        var paid = await ReadInvoiceAsync(paidResponse);
        return (token, paid);
    }

    private static void AssertInvoiceBusinessDataUnchanged(
        InvoiceResponse expected,
        InvoiceResponse actual)
    {
        Assert.Equal(expected.Id, actual.Id);
        Assert.Equal(expected.InvoiceNumber, actual.InvoiceNumber);
        Assert.Equal(expected.CustomerId, actual.CustomerId);
        Assert.Equal(expected.IssueDate, actual.IssueDate);
        Assert.Equal(expected.DueDate, actual.DueDate);
        Assert.Equal(expected.Currency, actual.Currency);
        Assert.Equal(expected.Subtotal, actual.Subtotal);
        Assert.Equal(expected.TaxTotal, actual.TaxTotal);
        Assert.Equal(expected.GrandTotal, actual.GrandTotal);
        Assert.Equal(expected.CreatedAt, actual.CreatedAt);
        Assert.Equal(expected.Items, actual.Items);
    }
}
