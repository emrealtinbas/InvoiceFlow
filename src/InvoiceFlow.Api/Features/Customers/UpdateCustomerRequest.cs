namespace InvoiceFlow.Api.Features.Customers;

/// <summary>
/// Full replacement request for an existing customer. The identifier, owner, and
/// creation timestamp are never accepted from the client.
/// </summary>
public sealed class UpdateCustomerRequest : CustomerWriteRequest
{
}
