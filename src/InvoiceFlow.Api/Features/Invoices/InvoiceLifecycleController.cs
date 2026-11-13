using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InvoiceFlow.Api.Features.Invoices;

/// <summary>Authenticated invoice lifecycle actions with optimistic concurrency.</summary>
[ApiController]
[Route("api/invoices/{id:guid}")]
[Authorize(Policy = AuthPolicies.AuthenticatedUser)]
public sealed class InvoiceLifecycleController(
    AppDbContext dbContext,
    ICurrentUser currentUser,
    InvoiceLifecycle lifecycle) : ControllerBase
{
    /// <summary>
    /// Transitions Draft to Sent. Sending requires at least one item and a customer e-mail address.
    /// </summary>
    [HttpPost("send")]
    [ProducesResponseType(typeof(InvoiceResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public Task<IActionResult> Send(
        Guid id,
        InvoiceLifecycleRequest request,
        CancellationToken cancellationToken) =>
        TransitionAsync(
            id,
            request,
            InvoiceStatus.Sent,
            requireSendPrerequisites: true,
            cancellationToken);

    /// <summary>Transitions Sent to Paid. This is a manual status change, not payment processing.</summary>
    [HttpPost("mark-paid")]
    [ProducesResponseType(typeof(InvoiceResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public Task<IActionResult> MarkPaid(
        Guid id,
        InvoiceLifecycleRequest request,
        CancellationToken cancellationToken) =>
        TransitionAsync(
            id,
            request,
            InvoiceStatus.Paid,
            requireSendPrerequisites: false,
            cancellationToken);

    /// <summary>Transitions Draft or Sent to the terminal Cancelled state.</summary>
    [HttpPost("cancel")]
    [ProducesResponseType(typeof(InvoiceResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public Task<IActionResult> Cancel(
        Guid id,
        InvoiceLifecycleRequest request,
        CancellationToken cancellationToken) =>
        TransitionAsync(
            id,
            request,
            InvoiceStatus.Cancelled,
            requireSendPrerequisites: false,
            cancellationToken);

    private async Task<IActionResult> TransitionAsync(
        Guid id,
        InvoiceLifecycleRequest request,
        InvoiceStatus target,
        bool requireSendPrerequisites,
        CancellationToken cancellationToken)
    {
        var invoice = await AccessibleInvoices()
            .Include(candidate => candidate.Items)
            .Include(candidate => candidate.Customer)
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);

        if (invoice is null)
        {
            return InvoiceNotFoundProblem();
        }

        if (!InvoiceConcurrencyToken.TryDecode(request.ConcurrencyToken, out var expectedVersion))
        {
            ModelState.AddModelError(nameof(request.ConcurrencyToken), "ConcurrencyToken is invalid.");
            return ValidationProblem(ModelState);
        }

        if (expectedVersion != invoice.Version)
        {
            return StaleConcurrencyTokenProblem();
        }

        if (!lifecycle.CanTransition(invoice.Status, target))
        {
            return InvalidTransitionProblem(invoice.Status, target);
        }

        if (requireSendPrerequisites &&
            (invoice.Items.Count == 0 || string.IsNullOrWhiteSpace(invoice.Customer.Email)))
        {
            return SendRequirementsProblem();
        }

        invoice.Status = target;
        dbContext.Entry(invoice).Property(candidate => candidate.UpdatedAt).IsModified = true;

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return ConcurrentChangeProblem();
        }

        return Ok(InvoiceResponse.From(invoice));
    }

    private IQueryable<Invoice> AccessibleInvoices()
    {
        if (User.IsInRole(AuthRoles.Admin))
        {
            return dbContext.Invoices;
        }

        var ownerId = currentUser.UserId;

        return ownerId is null
            ? dbContext.Invoices.Where(_ => false)
            : dbContext.Invoices.Where(invoice => invoice.OwnerId == ownerId.Value);
    }

    private static ObjectResult InvoiceNotFoundProblem() =>
        ProblemResult(StatusCodes.Status404NotFound, "Not Found", "The invoice was not found.");

    private static ObjectResult InvalidTransitionProblem(InvoiceStatus current, InvoiceStatus target) =>
        ProblemResult(
            StatusCodes.Status409Conflict,
            "Conflict",
            $"The invoice cannot transition from {current} to {target}.");

    private static ObjectResult SendRequirementsProblem() =>
        ProblemResult(
            StatusCodes.Status409Conflict,
            "Conflict",
            "Sending requires at least one invoice item and a customer e-mail address.");

    private static ObjectResult StaleConcurrencyTokenProblem() =>
        ProblemResult(
            StatusCodes.Status409Conflict,
            "Conflict",
            "The concurrency token is stale. Retrieve the invoice again and retry with the latest token.");

    private static ObjectResult ConcurrentChangeProblem() =>
        ProblemResult(
            StatusCodes.Status409Conflict,
            "Conflict",
            "The invoice changed during the operation. Retrieve it again and retry with the latest concurrency token.");

    private static ObjectResult ProblemResult(int statusCode, string title, string detail) =>
        new(new ProblemDetails
        {
            Status = statusCode,
            Title = title,
            Detail = detail,
        })
        {
            StatusCode = statusCode,
        };
}
