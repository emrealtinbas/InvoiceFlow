using InvoiceFlow.Api.Features.Auth;
using InvoiceFlow.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace InvoiceFlow.Api.Features.Customers;

/// <summary>
/// Customer CRUD. Every query is scoped to the authenticated user's ownership; administrators
/// may access all customers but never transfer ownership.
/// </summary>
[ApiController]
[Route("api/customers")]
[Authorize(Policy = AuthPolicies.AuthenticatedUser)]
public sealed class CustomersController(
    AppDbContext dbContext,
    ICurrentUser currentUser) : ControllerBase
{
    /// <summary>Creates a customer owned by the authenticated user.</summary>
    [HttpPost]
    [ProducesResponseType(typeof(CustomerResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(
        CreateCustomerRequest request,
        CancellationToken cancellationToken)
    {
        var ownerId = currentUser.UserId;

        if (ownerId is null)
        {
            return UnauthorizedProblem();
        }

        var email = CustomerEmail.Normalize(request.Email);

        if (email is not null &&
            await EmailExistsAsync(ownerId.Value, email, excludeId: null, cancellationToken))
        {
            return DuplicateEmailProblem();
        }

        var customer = new Customer
        {
            Id = Guid.NewGuid(),
            OwnerId = ownerId.Value,
            Name = request.Name,
            Email = email,
            Phone = request.Phone,
            Address = request.Address,
            TaxNumber = request.TaxNumber,
        };

        dbContext.Customers.Add(customer);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsEmailUniqueViolation(exception))
        {
            return DuplicateEmailProblem();
        }

        return CreatedAtAction(
            nameof(GetById),
            new { id = customer.Id },
            CustomerResponse.From(customer));
    }

    /// <summary>Returns a single customer when it is visible to the caller.</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(CustomerResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken cancellationToken)
    {
        var customer = await AccessibleCustomers()
            .AsNoTracking()
            .Where(candidate => candidate.Id == id)
            .Select(CustomerResponse.Projection)
            .FirstOrDefaultAsync(cancellationToken);

        return customer is null ? NotFoundProblem() : Ok(customer);
    }

    /// <summary>Lists visible customers with search, sorting, and pagination.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(PagedResponse<CustomerResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetAll(
        [FromQuery] CustomerQueryParameters parameters,
        CancellationToken cancellationToken)
    {
        var sortBy = string.IsNullOrWhiteSpace(parameters.SortBy) ? "name" : parameters.SortBy.Trim();

        if (!IsAllowedSortField(sortBy))
        {
            ModelState.AddModelError(
                nameof(parameters.SortBy),
                $"sortBy must be one of: {string.Join(", ", AllowedSortFields)}.");
            return ValidationProblem(ModelState);
        }

        if (!TryParseSortDirection(parameters.SortDirection, out var descending))
        {
            ModelState.AddModelError(
                nameof(parameters.SortDirection),
                "sortDirection must be 'asc' or 'desc'.");
            return ValidationProblem(ModelState);
        }

        var query = AccessibleCustomers().AsNoTracking();

        if (!string.IsNullOrWhiteSpace(parameters.Search))
        {
            var pattern = $"%{EscapeLikePattern(parameters.Search.Trim())}%";

            query = query.Where(customer =>
                EF.Functions.ILike(customer.Name, pattern, LikeEscapeCharacter) ||
                (customer.Email != null &&
                    EF.Functions.ILike(customer.Email, pattern, LikeEscapeCharacter)) ||
                (customer.TaxNumber != null &&
                    EF.Functions.ILike(customer.TaxNumber, pattern, LikeEscapeCharacter)));
        }

        var totalCount = await query.CountAsync(cancellationToken);

        var skip = (long)(parameters.Page - 1) * parameters.PageSize;
        List<CustomerResponse> items;

        if (skip > int.MaxValue)
        {
            items = [];
        }
        else
        {
            items = await ApplySorting(query, sortBy, descending)
                .Skip((int)skip)
                .Take(parameters.PageSize)
                .Select(CustomerResponse.Projection)
                .ToListAsync(cancellationToken);
        }

        var totalPages = totalCount == 0
            ? 0
            : (int)Math.Ceiling(totalCount / (double)parameters.PageSize);

        return Ok(new PagedResponse<CustomerResponse>(
            items,
            parameters.Page,
            parameters.PageSize,
            totalCount,
            totalPages));
    }

    /// <summary>Replaces a visible customer's mutable fields.</summary>
    [HttpPut("{id:guid}")]
    [ProducesResponseType(typeof(CustomerResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(
        Guid id,
        UpdateCustomerRequest request,
        CancellationToken cancellationToken)
    {
        var customer = await AccessibleCustomers()
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);

        if (customer is null)
        {
            return NotFoundProblem();
        }

        var email = CustomerEmail.Normalize(request.Email);

        if (email is not null &&
            await EmailExistsAsync(customer.OwnerId, email, customer.Id, cancellationToken))
        {
            return DuplicateEmailProblem();
        }

        customer.Name = request.Name;
        customer.Email = email;
        customer.Phone = request.Phone;
        customer.Address = request.Address;
        customer.TaxNumber = request.TaxNumber;

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsEmailUniqueViolation(exception))
        {
            return DuplicateEmailProblem();
        }

        return Ok(CustomerResponse.From(customer));
    }

    /// <summary>Deletes a visible customer that has no invoices.</summary>
    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var customer = await AccessibleCustomers()
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);

        if (customer is null)
        {
            return NotFoundProblem();
        }

        if (await dbContext.Invoices.AnyAsync(
                invoice => invoice.CustomerId == customer.Id,
                cancellationToken))
        {
            return InvoiceConflictProblem();
        }

        dbContext.Customers.Remove(customer);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsForeignKeyViolation(exception))
        {
            // A concurrent request created an invoice after the check above.
            return InvoiceConflictProblem();
        }

        return NoContent();
    }

    /// <summary>
    /// Query-level ownership filter. Administrators see every customer; normal users see
    /// only their own. An unauthenticated principal (which should not reach the action)
    /// sees nothing.
    /// </summary>
    private IQueryable<Customer> AccessibleCustomers()
    {
        if (User.IsInRole(AuthRoles.Admin))
        {
            return dbContext.Customers;
        }

        var ownerId = currentUser.UserId;

        return ownerId is null
            ? dbContext.Customers.Where(_ => false)
            : dbContext.Customers.Where(customer => customer.OwnerId == ownerId.Value);
    }

    private Task<bool> EmailExistsAsync(
        Guid ownerId,
        string normalizedEmail,
        Guid? excludeId,
        CancellationToken cancellationToken)
    {
        var pattern = EscapeLikePattern(normalizedEmail);

        return dbContext.Customers.AnyAsync(
            customer =>
                customer.OwnerId == ownerId &&
                customer.Email != null &&
                EF.Functions.ILike(customer.Email, pattern, LikeEscapeCharacter) &&
                (excludeId == null || customer.Id != excludeId),
            cancellationToken);
    }

    private static IOrderedQueryable<Customer> ApplySorting(
        IQueryable<Customer> query,
        string sortBy,
        bool descending)
    {
        if (sortBy.Equals("email", StringComparison.OrdinalIgnoreCase))
        {
            return descending
                ? query.OrderByDescending(customer => customer.Email).ThenBy(customer => customer.Id)
                : query.OrderBy(customer => customer.Email).ThenBy(customer => customer.Id);
        }

        if (sortBy.Equals("createdAt", StringComparison.OrdinalIgnoreCase))
        {
            return descending
                ? query.OrderByDescending(customer => customer.CreatedAt).ThenBy(customer => customer.Id)
                : query.OrderBy(customer => customer.CreatedAt).ThenBy(customer => customer.Id);
        }

        if (sortBy.Equals("updatedAt", StringComparison.OrdinalIgnoreCase))
        {
            return descending
                ? query.OrderByDescending(customer => customer.UpdatedAt).ThenBy(customer => customer.Id)
                : query.OrderBy(customer => customer.UpdatedAt).ThenBy(customer => customer.Id);
        }

        return descending
            ? query.OrderByDescending(customer => customer.Name).ThenBy(customer => customer.Id)
            : query.OrderBy(customer => customer.Name).ThenBy(customer => customer.Id);
    }

    private static bool IsAllowedSortField(string sortBy) =>
        sortBy.Equals("name", StringComparison.OrdinalIgnoreCase) ||
        sortBy.Equals("email", StringComparison.OrdinalIgnoreCase) ||
        sortBy.Equals("createdAt", StringComparison.OrdinalIgnoreCase) ||
        sortBy.Equals("updatedAt", StringComparison.OrdinalIgnoreCase);

    private static bool TryParseSortDirection(string? value, out bool descending)
    {
        descending = false;

        if (string.IsNullOrWhiteSpace(value) ||
            value.Equals("asc", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (value.Equals("desc", StringComparison.OrdinalIgnoreCase))
        {
            descending = true;
            return true;
        }

        return false;
    }

    private static string EscapeLikePattern(string value) =>
        value
            .Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("%", "\\%", StringComparison.Ordinal)
            .Replace("_", "\\_", StringComparison.Ordinal);

    private static bool IsEmailUniqueViolation(DbUpdateException exception) =>
        exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: EmailIndexName,
        };

    private static bool IsForeignKeyViolation(DbUpdateException exception) =>
        exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.ForeignKeyViolation,
        };

    private static ObjectResult NotFoundProblem() =>
        ProblemResult(StatusCodes.Status404NotFound, "Not Found", "The customer was not found.");

    private static ObjectResult UnauthorizedProblem() =>
        ProblemResult(
            StatusCodes.Status401Unauthorized,
            "Unauthorized",
            "Authentication is required to access this resource.");

    private static ObjectResult DuplicateEmailProblem() =>
        ProblemResult(
            StatusCodes.Status409Conflict,
            "Conflict",
            "A customer with this e-mail address already exists.");

    private static ObjectResult InvoiceConflictProblem() =>
        ProblemResult(
            StatusCodes.Status409Conflict,
            "Conflict",
            "The customer cannot be deleted because it has invoices.");

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

    private const string EmailIndexName = "UX_Customers_OwnerId_Email_Lower";
    private const string LikeEscapeCharacter = "\\";

    private static readonly string[] AllowedSortFields =
        ["name", "email", "createdAt", "updatedAt"];
}
