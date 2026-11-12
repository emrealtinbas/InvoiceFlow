namespace InvoiceFlow.Api.Features.Customers;

/// <summary>
/// Request body for creating a customer. Ownership always comes from the validated JWT,
/// never from this body.
/// </summary>
public sealed class CreateCustomerRequest : CustomerWriteRequest
{
}
