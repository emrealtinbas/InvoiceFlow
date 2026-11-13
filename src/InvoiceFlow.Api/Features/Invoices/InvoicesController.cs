using System.ComponentModel.DataAnnotations;
using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Features.Customers;
using InvoiceFlow.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace InvoiceFlow.Api.Features.Invoices;

/// <summary>Draft invoice CRUD with owner isolation and server-side financial calculations.</summary>
[ApiController]
[Route("api/invoices")]
[Authorize(Policy = AuthPolicies.AuthenticatedUser)]
public sealed class InvoicesController(
    AppDbContext dbContext,
    ICurrentUser currentUser,
    InvoiceCalculator calculator,
    InvoiceNumberGenerator numberGenerator,
    TimeProvider timeProvider) : ControllerBase
{
    /// <summary>Creates a Draft TRY invoice owned by the authenticated user.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(InvoiceResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Create(
        CreateInvoiceRequest request,
        CancellationToken cancellationToken)
    {
        var ownerId = currentUser.UserId;

        if (ownerId is null)
        {
            return UnauthorizedProblem();
        }

        var issueDate = request.IssueDate ?? DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime);

        if (request.DueDate < issueDate)
        {
            ModelState.AddModelError(
                nameof(request.DueDate),
                "DueDate must be on or after IssueDate.");
            return ValidationProblem(ModelState);
        }

        if (!await CustomerExistsAsync(request.CustomerId, ownerId.Value, cancellationToken))
        {
            return CustomerNotFoundProblem();
        }

        if (!TryCalculate(request.Items, out var calculation, out var calculationProblem))
        {
            return calculationProblem;
        }

        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            OwnerId = ownerId.Value,
            CustomerId = request.CustomerId,
            InvoiceNumber = await numberGenerator.NextAsync(issueDate, cancellationToken),
            IssueDate = issueDate,
            DueDate = request.DueDate,
            Status = InvoiceStatus.Draft,
            Currency = "TRY",
            Subtotal = calculation.Subtotal,
            TaxTotal = calculation.TaxTotal,
            GrandTotal = calculation.GrandTotal,
        };

        AddItems(invoice, request.Items, calculation);
        dbContext.Invoices.Add(invoice);
        await dbContext.SaveChangesAsync(cancellationToken);

        return CreatedAtAction(
            nameof(GetById),
            new { id = invoice.Id },
            InvoiceResponse.From(invoice));
    }

    /// <summary>Returns one visible invoice, including its calculated lines.</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(InvoiceResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var invoice = await AccessibleInvoices()
            .AsNoTracking()
            .Include(candidate => candidate.Items)
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);

        return invoice is null ? InvoiceNotFoundProblem() : Ok(InvoiceResponse.From(invoice));
    }

    /// <summary>Lists visible invoices using PostgreSQL-side filtering and pagination.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(InvoicePagedResponse<InvoiceSummaryResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetAll(
        [FromQuery] InvoiceQueryParameters parameters,
        CancellationToken cancellationToken)
    {
        if (!TryParseStatus(parameters.Status, out var status))
        {
            ModelState.AddModelError(
                nameof(parameters.Status),
                $"status must be one of: {string.Join(", ", Enum.GetNames<InvoiceStatus>())}.");
        }

        var sortBy = string.IsNullOrWhiteSpace(parameters.SortBy)
            ? "issueDate"
            : parameters.SortBy.Trim();

        if (!AllowedSortFields.Contains(sortBy, StringComparer.OrdinalIgnoreCase))
        {
            ModelState.AddModelError(
                nameof(parameters.SortBy),
                $"sortBy must be one of: {string.Join(", ", AllowedSortFields)}.");
        }

        if (!TryParseSortDirection(parameters.SortDirection, out var descending))
        {
            ModelState.AddModelError(
                nameof(parameters.SortDirection),
                "sortDirection must be 'asc' or 'desc'.");
        }

        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var query = AccessibleInvoices().AsNoTracking();

        if (parameters.CustomerId is not null)
        {
            query = query.Where(invoice => invoice.CustomerId == parameters.CustomerId.Value);
        }

        if (status is not null)
        {
            query = query.Where(invoice => invoice.Status == status);
        }

        if (parameters.IssueDateFrom is not null)
        {
            query = query.Where(invoice => invoice.IssueDate >= parameters.IssueDateFrom.Value);
        }

        if (parameters.IssueDateTo is not null)
        {
            query = query.Where(invoice => invoice.IssueDate <= parameters.IssueDateTo.Value);
        }

        if (!string.IsNullOrWhiteSpace(parameters.Search))
        {
            var pattern = $"%{EscapeLikePattern(parameters.Search.Trim())}%";
            query = query.Where(invoice =>
                EF.Functions.ILike(invoice.InvoiceNumber, pattern, LikeEscapeCharacter));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var skip = (long)(parameters.PageNumber - 1) * parameters.PageSize;
        List<Invoice> invoices;

        if (skip > int.MaxValue)
        {
            invoices = [];
        }
        else
        {
            invoices = await ApplySorting(query, sortBy, descending)
                .Skip((int)skip)
                .Take(parameters.PageSize)
                .ToListAsync(cancellationToken);
        }

        var items = invoices.Select(ToSummaryResponse).ToList();
        var totalPages = totalCount == 0
            ? 0
            : (int)Math.Ceiling(totalCount / (double)parameters.PageSize);

        return Ok(new InvoicePagedResponse<InvoiceSummaryResponse>(
            items,
            parameters.PageNumber,
            parameters.PageSize,
            totalCount,
            totalPages));
    }

    /// <summary>
    /// Replaces a Draft invoice. The latest opaque concurrency token is required.
    /// </summary>
    [HttpPut("{id:guid}")]
    [ProducesResponseType(typeof(InvoiceResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(
        Guid id,
        UpdateInvoiceRequest request,
        CancellationToken cancellationToken)
    {
        var invoice = await AccessibleInvoices()
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);

        if (invoice is null)
        {
            return InvoiceNotFoundProblem();
        }

        if (invoice.Status != InvoiceStatus.Draft)
        {
            return DraftOnlyProblem("updated");
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

        if (!await CustomerExistsAsync(request.CustomerId, invoice.OwnerId, cancellationToken))
        {
            return CustomerNotFoundProblem();
        }

        if (!TryCalculate(request.Items, out var calculation, out var calculationProblem))
        {
            return calculationProblem;
        }

        invoice.CustomerId = request.CustomerId;
        invoice.IssueDate = request.IssueDate;
        invoice.DueDate = request.DueDate;
        invoice.Subtotal = calculation.Subtotal;
        invoice.TaxTotal = calculation.TaxTotal;
        invoice.GrandTotal = calculation.GrandTotal;

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

        await dbContext.InvoiceItems
            .Where(item => item.InvoiceId == invoice.Id)
            .ExecuteDeleteAsync(cancellationToken);
        AddItems(invoice, request.Items, calculation);
        dbContext.InvoiceItems.AddRange(invoice.Items);

        var entry = dbContext.Entry(invoice);
        entry.Property(candidate => candidate.UpdatedAt).IsModified = true;

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            await transaction.RollbackAsync(cancellationToken);
            return ConcurrentChangeProblem();
        }

        await transaction.CommitAsync(cancellationToken);

        return Ok(InvoiceResponse.From(invoice));
    }

    /// <summary>
    /// Deletes a Draft invoice and its items. Supply the latest concurrencyToken query value.
    /// </summary>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Delete(
        Guid id,
        [FromQuery, Required] string concurrencyToken,
        CancellationToken cancellationToken)
    {
        if (!InvoiceConcurrencyToken.TryDecode(concurrencyToken, out var expectedVersion))
        {
            ModelState.AddModelError(nameof(concurrencyToken), "ConcurrencyToken is invalid.");
            return ValidationProblem(ModelState);
        }

        var invoice = await AccessibleInvoices()
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);

        if (invoice is null)
        {
            return InvoiceNotFoundProblem();
        }

        if (invoice.Status != InvoiceStatus.Draft)
        {
            return DraftOnlyProblem("deleted");
        }

        if (expectedVersion != invoice.Version)
        {
            return StaleConcurrencyTokenProblem();
        }

        dbContext.Invoices.Remove(invoice);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            return ConcurrentChangeProblem();
        }

        return NoContent();
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

    private Task<bool> CustomerExistsAsync(
        Guid customerId,
        Guid ownerId,
        CancellationToken cancellationToken) =>
        dbContext.Customers.AnyAsync(
            customer => customer.Id == customerId && customer.OwnerId == ownerId,
            cancellationToken);

    private bool TryCalculate(
        IReadOnlyCollection<InvoiceItemRequest> requests,
        out InvoiceCalculation calculation,
        out IActionResult problem)
    {
        try
        {
            calculation = calculator.Calculate(requests
                .Select(item => new InvoiceCalculationInput(
                    item.Quantity,
                    item.UnitPrice,
                    item.TaxRate))
                .ToList());
            problem = null!;
            return true;
        }
        catch (InvoiceCalculationException exception)
        {
            ModelState.AddModelError(nameof(requests), exception.Message);
            calculation = null!;
            problem = ValidationProblem(ModelState);
            return false;
        }
    }

    private static void AddItems(
        Invoice invoice,
        List<InvoiceItemRequest> requests,
        InvoiceCalculation calculation)
    {
        for (var index = 0; index < requests.Count; index++)
        {
            var request = requests[index];
            var amounts = calculation.Lines[index];

            invoice.Items.Add(new InvoiceItem
            {
                Id = Guid.NewGuid(),
                InvoiceId = invoice.Id,
                Description = request.Description,
                Quantity = request.Quantity,
                UnitPrice = request.UnitPrice,
                TaxRate = request.TaxRate,
                LineSubtotal = amounts.LineSubtotal,
                LineTax = amounts.LineTax,
                LineTotal = amounts.LineTotal,
            });
        }
    }

    private static InvoiceSummaryResponse ToSummaryResponse(Invoice invoice) =>
        new(
            invoice.Id,
            invoice.InvoiceNumber,
            invoice.CustomerId,
            invoice.IssueDate,
            invoice.DueDate,
            invoice.Status,
            invoice.Currency,
            invoice.Subtotal,
            invoice.TaxTotal,
            invoice.GrandTotal,
            invoice.CreatedAt,
            invoice.UpdatedAt,
            InvoiceConcurrencyToken.Encode(invoice.Version));

    private static IOrderedQueryable<Invoice> ApplySorting(
        IQueryable<Invoice> query,
        string sortBy,
        bool descending)
    {
        if (sortBy.Equals("invoiceNumber", StringComparison.OrdinalIgnoreCase))
        {
            return descending
                ? query.OrderByDescending(invoice => invoice.InvoiceNumber).ThenBy(invoice => invoice.Id)
                : query.OrderBy(invoice => invoice.InvoiceNumber).ThenBy(invoice => invoice.Id);
        }

        if (sortBy.Equals("dueDate", StringComparison.OrdinalIgnoreCase))
        {
            return descending
                ? query.OrderByDescending(invoice => invoice.DueDate).ThenBy(invoice => invoice.Id)
                : query.OrderBy(invoice => invoice.DueDate).ThenBy(invoice => invoice.Id);
        }

        if (sortBy.Equals("grandTotal", StringComparison.OrdinalIgnoreCase))
        {
            return descending
                ? query.OrderByDescending(invoice => invoice.GrandTotal).ThenBy(invoice => invoice.Id)
                : query.OrderBy(invoice => invoice.GrandTotal).ThenBy(invoice => invoice.Id);
        }

        if (sortBy.Equals("createdAt", StringComparison.OrdinalIgnoreCase))
        {
            return descending
                ? query.OrderByDescending(invoice => invoice.CreatedAt).ThenBy(invoice => invoice.Id)
                : query.OrderBy(invoice => invoice.CreatedAt).ThenBy(invoice => invoice.Id);
        }

        return descending
            ? query.OrderByDescending(invoice => invoice.IssueDate).ThenBy(invoice => invoice.Id)
            : query.OrderBy(invoice => invoice.IssueDate).ThenBy(invoice => invoice.Id);
    }

    private static bool TryParseStatus(string? value, out InvoiceStatus? status)
    {
        status = null;

        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        var name = Enum.GetNames<InvoiceStatus>()
            .FirstOrDefault(candidate => candidate.Equals(value.Trim(), StringComparison.OrdinalIgnoreCase));

        if (name is null)
        {
            return false;
        }

        status = Enum.Parse<InvoiceStatus>(name);
        return true;
    }

    private static bool TryParseSortDirection(string? value, out bool descending)
    {
        descending = true;

        if (string.IsNullOrWhiteSpace(value) || value.Equals("desc", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (value.Equals("asc", StringComparison.OrdinalIgnoreCase))
        {
            descending = false;
            return true;
        }

        return false;
    }

    private static string EscapeLikePattern(string value) =>
        value
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);

    private static ObjectResult InvoiceNotFoundProblem() =>
        ProblemResult(StatusCodes.Status404NotFound, "Not Found", "The invoice was not found.");

    private static ObjectResult CustomerNotFoundProblem() =>
        ProblemResult(StatusCodes.Status404NotFound, "Not Found", "The customer was not found.");

    private static ObjectResult UnauthorizedProblem() =>
        ProblemResult(
            StatusCodes.Status401Unauthorized,
            "Unauthorized",
            "Authentication is required to access this resource.");

    private static ObjectResult DraftOnlyProblem(string operation) =>
        ProblemResult(
            StatusCodes.Status409Conflict,
            "Conflict",
            $"Only Draft invoices can be {operation}.");

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

    private const string LikeEscapeCharacter = "\\";

    private static readonly string[] AllowedSortFields =
        ["invoiceNumber", "issueDate", "dueDate", "grandTotal", "createdAt"];
}
