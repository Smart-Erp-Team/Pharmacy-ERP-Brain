using PharmacyERP.Application.Features.Catalog.DTOs;
using PharmacyERP.Application.Features.Catalog.Validators;
using Xunit;

namespace PharmacyERP.UnitTests.Application.Catalog;

public class CatalogValidatorsTests
{
    [Fact]
    public void CreateProductCategoryRequestValidator_ValidRequest_Passes()
    {
        var request = new CreateProductCategoryRequest(null, "CAT01", "Painkillers", "Description", "idemp-1");
        var errors = CreateProductCategoryRequestValidator.Validate(request);
        Assert.Empty(errors);
    }

    [Theory]
    [InlineData("", "Name", "Code is required.")]
    [InlineData("   ", "Name", "Code is required.")]
    [InlineData("CODE", "", "Name is required.")]
    public void CreateProductCategoryRequestValidator_RequiredFields_Fails(string code, string name, string expectedIssue)
    {
        var request = new CreateProductCategoryRequest(null, code, name, null, "idemp-1");
        var errors = CreateProductCategoryRequestValidator.Validate(request);
        Assert.Contains(errors, e => e.Issue == expectedIssue);
    }

    [Fact]
    public void CreateProductCategoryRequestValidator_BoundaryLengths_WorksCorrectly()
    {
        // Code 30 chars passes, 31 fails
        var validCode = new string('A', 30);
        var invalidCode = new string('A', 31);
        Assert.Empty(CreateProductCategoryRequestValidator.Validate(new(null, validCode, "Name", null, "k")));
        Assert.Contains(CreateProductCategoryRequestValidator.Validate(new(null, invalidCode, "Name", null, "k")), e => e.Field == "Code");

        // Name 100 chars passes, 101 fails
        var validName = new string('B', 100);
        var invalidName = new string('B', 101);
        Assert.Empty(CreateProductCategoryRequestValidator.Validate(new(null, "C", validName, null, "k")));
        Assert.Contains(CreateProductCategoryRequestValidator.Validate(new(null, "C", invalidName, null, "k")), e => e.Field == "Name");

        // Description 250 chars passes, 251 fails
        var validDesc = new string('D', 250);
        var invalidDesc = new string('D', 251);
        Assert.Empty(CreateProductCategoryRequestValidator.Validate(new(null, "C", "Name", validDesc, "k")));
        Assert.Contains(CreateProductCategoryRequestValidator.Validate(new(null, "C", "Name", invalidDesc, "k")), e => e.Field == "Description");
    }

    [Fact]
    public void UpdateProductCategoryRequestValidator_BoundaryLengths_WorksCorrectly()
    {
        var invalidName = new string('N', 101);
        var errors = UpdateProductCategoryRequestValidator.Validate(new(null, invalidName, null, null, "k"));
        Assert.Contains(errors, e => e.Field == "Name");

        var invalidDesc = new string('D', 251);
        var descErrors = UpdateProductCategoryRequestValidator.Validate(new(null, "Name", invalidDesc, null, "k"));
        Assert.Contains(descErrors, e => e.Field == "Description");
    }

    [Fact]
    public void CreateProductRequestValidator_ValidRequest_Passes()
    {
        var uoms = new List<CreateProductUomItemRequest>
        {
            new("BOX", "Box", 1m, 100m, true, true, true)
        };
        var request = new CreateProductRequest(
            Guid.NewGuid(), "SKU-001", "12345678", "Panadol", "Paracetamol", "GSK",
            "BOX", 0.14m, "http://image.png", true, 30, uoms, "idemp-key");

        var errors = CreateProductRequestValidator.Validate(request);
        Assert.Empty(errors);
    }

    [Fact]
    public void CreateProductRequestValidator_BoundaryLengths_WorksCorrectly()
    {
        var uoms = new List<CreateProductUomItemRequest>
        {
            new("BOX", "Box", 1m, 100m, true, true, true)
        };

        // Sku: 40 chars passes, 41 fails
        var validSku = new string('S', 40);
        var invalidSku = new string('S', 41);
        Assert.Empty(CreateProductRequestValidator.Validate(new(Guid.NewGuid(), validSku, null, "Name", null, null, "BOX", 0m, null, false, 0, uoms, "k")));
        Assert.Contains(CreateProductRequestValidator.Validate(new(Guid.NewGuid(), invalidSku, null, "Name", null, null, "BOX", 0m, null, false, 0, uoms, "k")), e => e.Field == "Sku");

        // Barcode: 80 chars passes, 81 fails
        var validBarcode = new string('B', 80);
        var invalidBarcode = new string('B', 81);
        Assert.Empty(CreateProductRequestValidator.Validate(new(Guid.NewGuid(), "SKU", validBarcode, "Name", null, null, "BOX", 0m, null, false, 0, uoms, "k")));
        Assert.Contains(CreateProductRequestValidator.Validate(new(Guid.NewGuid(), "SKU", invalidBarcode, "Name", null, null, "BOX", 0m, null, false, 0, uoms, "k")), e => e.Field == "Barcode");

        // Name: 180 chars passes, 181 fails
        var validName = new string('N', 180);
        var invalidName = new string('N', 181);
        Assert.Empty(CreateProductRequestValidator.Validate(new(Guid.NewGuid(), "SKU", null, validName, null, null, "BOX", 0m, null, false, 0, uoms, "k")));
        Assert.Contains(CreateProductRequestValidator.Validate(new(Guid.NewGuid(), "SKU", null, invalidName, null, null, "BOX", 0m, null, false, 0, uoms, "k")), e => e.Field == "Name");

        // BaseUomCode: 20 chars passes, 21 fails
        var validUom = new string('U', 20);
        var invalidUom = new string('U', 21);
        var validUoms = new List<CreateProductUomItemRequest> { new(validUom, "Unit", 1m, 10m, true, true, true) };
        Assert.Empty(CreateProductRequestValidator.Validate(new(Guid.NewGuid(), "SKU", null, "Name", null, null, validUom, 0m, null, false, 0, validUoms, "k")));
        Assert.Contains(CreateProductRequestValidator.Validate(new(Guid.NewGuid(), "SKU", null, "Name", null, null, invalidUom, 0m, null, false, 0, validUoms, "k")), e => e.Field == "BaseUomCode");

        // ImageUrl: 300 chars passes, 301 fails
        var validImg = new string('I', 300);
        var invalidImg = new string('I', 301);
        Assert.Empty(CreateProductRequestValidator.Validate(new(Guid.NewGuid(), "SKU", null, "Name", null, null, "BOX", 0m, validImg, false, 0, uoms, "k")));
        Assert.Contains(CreateProductRequestValidator.Validate(new(Guid.NewGuid(), "SKU", null, "Name", null, null, "BOX", 0m, invalidImg, false, 0, uoms, "k")), e => e.Field == "ImageUrl");
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(1.01)]
    public void CreateProductRequestValidator_TaxRateOutOfBounds_Fails(decimal taxRate)
    {
        var uoms = new List<CreateProductUomItemRequest> { new("BOX", "Box", 1m, 100m, true, true, true) };
        var request = new CreateProductRequest(Guid.NewGuid(), "SKU", null, "Name", null, null, "BOX", taxRate, null, false, 0, uoms, "k");
        var errors = CreateProductRequestValidator.Validate(request);
        Assert.Contains(errors, e => e.Field == "TaxRate");
    }

    [Fact]
    public void CreateProductRequestValidator_NegativeExpiryAlertDays_Fails()
    {
        var uoms = new List<CreateProductUomItemRequest> { new("BOX", "Box", 1m, 100m, true, true, true) };
        var request = new CreateProductRequest(Guid.NewGuid(), "SKU", null, "Name", null, null, "BOX", 0.14m, null, false, -1, uoms, "k");
        var errors = CreateProductRequestValidator.Validate(request);
        Assert.Contains(errors, e => e.Field == "ExpiryAlertDays");
    }

    [Fact]
    public void CreateProductRequestValidator_MissingBaseUomInList_Fails()
    {
        var uoms = new List<CreateProductUomItemRequest>
        {
            new("STRIP", "Strip", 0.5m, 50m, false, true, true)
        };
        var request = new CreateProductRequest(Guid.NewGuid(), "SKU", null, "Name", null, null, "BOX", 0.14m, null, false, 0, uoms, "k");
        var errors = CreateProductRequestValidator.Validate(request);
        Assert.Contains(errors, e => e.Field == "Uoms" && e.Issue.Contains("exactly one base UOM"));
    }

    [Fact]
    public void CreateProductRequestValidator_MultipleBaseUoms_Fails()
    {
        var uoms = new List<CreateProductUomItemRequest>
        {
            new("BOX", "Box", 1m, 100m, true, true, true),
            new("STRIP", "Strip", 1m, 50m, true, true, true)
        };
        var request = new CreateProductRequest(Guid.NewGuid(), "SKU", null, "Name", null, null, "BOX", 0.14m, null, false, 0, uoms, "k");
        var errors = CreateProductRequestValidator.Validate(request);
        Assert.Contains(errors, e => e.Field == "Uoms" && e.Issue.Contains("exactly one base UOM"));
    }

    [Fact]
    public void CreateProductUomItemRequestValidator_SellableWithoutPrice_Fails()
    {
        var request = new CreateProductUomItemRequest("BOX", "Box", 1m, null, true, true, true);
        var errors = CreateProductUomItemRequestValidator.Validate(request, "Uoms[0]");
        Assert.Contains(errors, e => e.Field == "Uoms[0].SaleUnitPrice");
    }

    [Fact]
    public void CreateProductUomRequestValidator_ValidRequest_Passes()
    {
        var request = new CreateProductUomRequest("STRIP", "Strip", 0.1m, 10m, false, true, true, "idemp-key");
        var errors = CreateProductUomRequestValidator.Validate(request);
        Assert.Empty(errors);
    }

    [Fact]
    public void UpdateProductUomRequestValidator_NonPositiveConversionFactor_Fails()
    {
        var request = new UpdateProductUomRequest(null, -1m, null, null, null, null, "idemp-key");
        var errors = UpdateProductUomRequestValidator.Validate(request);
        Assert.Contains(errors, e => e.Field == "ConversionToBase");
    }

    [Fact]
    public void UpsertReorderRuleRequestValidator_ValidRequest_Passes()
    {
        var request = new UpsertReorderRuleRequest(10m, 50m, 100m, true, "idemp-key");
        var errors = UpsertReorderRuleRequestValidator.Validate(request);
        Assert.Empty(errors);
    }

    [Fact]
    public void UpsertReorderRuleRequestValidator_NegativePoints_Fails()
    {
        var request = new UpsertReorderRuleRequest(-5m, 50m, 100m, true, "idemp-key");
        var errors = UpsertReorderRuleRequestValidator.Validate(request);
        Assert.Contains(errors, e => e.Field == "ReorderPointBase");
    }

    [Fact]
    public void UpsertReorderRuleRequestValidator_MaxQuantityLessThanReorderPoint_Fails()
    {
        var request = new UpsertReorderRuleRequest(50m, 10m, 40m, true, "idemp-key");
        var errors = UpsertReorderRuleRequestValidator.Validate(request);
        Assert.Contains(errors, e => e.Field == "MaxQuantityBase");
    }
}
