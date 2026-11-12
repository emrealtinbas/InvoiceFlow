using System.ComponentModel.DataAnnotations;
using InvoiceFlow.Api.Features.Customers;

namespace InvoiceFlow.UnitTests.Features.Customers;

public sealed class CustomerRequestValidationTests
{
    [Theory]
    [InlineData("")]
    [InlineData("A")]
    [InlineData("   ")]
    public void CreateRequest_NameShorterThanTwoCharacters_IsInvalid(string name)
    {
        var request = new CreateCustomerRequest { Name = name };

        var results = Validate(request);

        Assert.Contains(results, result => result.MemberNames.Contains(nameof(request.Name)));
    }

    [Fact]
    public void CreateRequest_NameIsTrimmedBeforeValidation()
    {
        var request = new CreateCustomerRequest { Name = "  Acme  " };

        var results = Validate(request);

        Assert.Empty(results);
        Assert.Equal("Acme", request.Name);
    }

    private static List<ValidationResult> Validate(object instance)
    {
        var results = new List<ValidationResult>();
        Validator.TryValidateObject(instance, new ValidationContext(instance), results, true);
        return results;
    }
}
