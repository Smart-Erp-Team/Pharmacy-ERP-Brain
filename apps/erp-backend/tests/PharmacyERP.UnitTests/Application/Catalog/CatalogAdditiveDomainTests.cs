using PharmacyERP.Domain.Entities.Catalog;
using PharmacyERP.Domain.Exceptions;
using Xunit;

namespace PharmacyERP.UnitTests.Application.Catalog;

public class CatalogAdditiveDomainTests
{
    private readonly Guid _orgId = Guid.NewGuid();

    private Product CreateSampleProduct()
    {
        var initialUoms = new List<InitialUomDefinition>
        {
            new("BOX", "Box", 1m, 100m, true, true, true)
        };

        return Product.Create(
            _orgId,
            Guid.NewGuid(),
            "SKU-DOM-01",
            "1122334455",
            "Initial Name",
            "Generic Name",
            "Brand Name",
            "BOX",
            0.14m,
            "http://example.com/img.png",
            true,
            30,
            initialUoms);
    }

    [Fact]
    public void Product_UpdateDetails_UpdatesFieldsAndTimestamp_WhenValid()
    {
        var product = CreateSampleProduct();
        var originalUpdated = product.UpdatedAt;
        var newCategoryId = Guid.NewGuid();

        product.UpdateDetails(
            categoryId: newCategoryId,
            sku: "SKU-DOM-02",
            barcode: "9988776655",
            name: "Updated Name",
            genericName: "Updated Generic",
            brandName: "Updated Brand",
            taxRate: 0.05m,
            imageUrl: "http://example.com/new.png",
            expiryAlertDays: 60);

        Assert.Equal(newCategoryId, product.CategoryId);
        Assert.Equal("SKU-DOM-02", product.Sku);
        Assert.Equal("9988776655", product.Barcode);
        Assert.Equal("Updated Name", product.Name);
        Assert.Equal("Updated Generic", product.GenericName);
        Assert.Equal("Updated Brand", product.BrandName);
        Assert.Equal(0.05m, product.TaxRate);
        Assert.Equal("http://example.com/new.png", product.ImageUrl);
        Assert.Equal(60, product.ExpiryAlertDays);
        Assert.True(product.UpdatedAt >= originalUpdated);
    }

    [Fact]
    public void Product_UpdateDetails_IgnoresNullParameters()
    {
        var product = CreateSampleProduct();
        var originalName = product.Name;
        var originalSku = product.Sku;

        product.UpdateDetails(null, null, null, null, null, null, null, null, null);

        Assert.Equal(originalName, product.Name);
        Assert.Equal(originalSku, product.Sku);
    }

    [Fact]
    public void Product_UpdateDetails_Throws_OnInvalidTaxRate()
    {
        var product = CreateSampleProduct();
        Assert.Throws<InvalidProductTaxRateException>(() =>
            product.UpdateDetails(null, null, null, null, null, null, 1.5m, null, null));
    }

    [Fact]
    public void Product_SetActiveState_TogglesCorrectly()
    {
        var product = CreateSampleProduct();
        Assert.True(product.IsActive);

        product.SetActiveState(false);
        Assert.False(product.IsActive);

        product.SetActiveState(true);
        Assert.True(product.IsActive);
    }

    [Fact]
    public void ProductUom_Activate_SetsIsActiveToTrue()
    {
        var product = CreateSampleProduct();
        var uom = product.AddUom("STRIP", "Strip", 0.1m, 10m, false, true, true);
        uom.Deactivate();
        Assert.False(uom.IsActive);

        uom.Activate();
        Assert.True(uom.IsActive);
    }

    [Fact]
    public void ProductReorderRule_SetActiveState_TogglesCorrectly()
    {
        var rule = ProductReorderRule.Create(_orgId, Guid.NewGuid(), Guid.NewGuid(), 10m, 50m, 100m);
        Assert.True(rule.IsActive);

        rule.SetActiveState(false);
        Assert.False(rule.IsActive);

        rule.SetActiveState(true);
        Assert.True(rule.IsActive);
    }
}
