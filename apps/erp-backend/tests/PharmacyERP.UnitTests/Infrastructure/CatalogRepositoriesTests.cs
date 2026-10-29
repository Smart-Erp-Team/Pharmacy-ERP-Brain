using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using PharmacyERP.Application.Common.Interfaces.Persistence;
using PharmacyERP.Application.Features.Catalog.Interfaces;
using PharmacyERP.Domain.Entities.Catalog;
using PharmacyERP.Infrastructure;
using PharmacyERP.Infrastructure.Persistence.Database;
using PharmacyERP.Infrastructure.Persistence.Repositories.Catalog;
using PharmacyERP.Infrastructure.Services.Context;
using Xunit;

namespace PharmacyERP.UnitTests.Infrastructure;

public class CatalogRepositoriesTests
{
    private static PharmacyDbContext CreateInMemoryContext(TenantContext tenantContext)
    {
        var options = new DbContextOptionsBuilder<PharmacyDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(w => w.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options;

        return new PharmacyDbContext(options, tenantContext);
    }

    private static InitialUomDefinition CreateBaseUom(string code = "TAB", decimal price = 10m) =>
        new(code, "Tablet", 1m, price, IsBase: true, IsSellable: true, IsPurchasable: true);

    #region ProductRepository Tests

    [Fact]
    public async Task ProductRepository_ExistsBySkuAsync_ReturnsTrueWhenExists_AndRespectsExclusionAndTenant()
    {
        var orgA = Guid.NewGuid();
        var orgB = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.AllowSystemBypass();

        await using var context = CreateInMemoryContext(tenantContext);
        var repository = new ProductRepository(context);

        var catA = ProductCategory.Create(orgA, "CAT01", "Category A", null, null);
        var catB = ProductCategory.Create(orgB, "CAT02", "Category B", null, null);
        await context.ProductCategories.AddRangeAsync(catA, catB);

        var productA = Product.Create(orgA, catA.CategoryId, "SKU-A", "BAR-A", "Panadol", null, null, "TAB", 0.14m, null, false, 0, new[] { CreateBaseUom() });
        var productB = Product.Create(orgB, catB.CategoryId, "SKU-B", "BAR-B", "Aspirin", null, null, "TAB", 0.14m, null, false, 0, new[] { CreateBaseUom() });
        await repository.AddAsync(productA);
        await repository.AddAsync(productB);
        await context.SaveChangesAsync();

        // 1. Exists in OrgA
        var existsInA = await repository.ExistsBySkuAsync(orgA, "SKU-A");
        Assert.True(existsInA);

        // 2. Excluded by productId
        var existsWithExclude = await repository.ExistsBySkuAsync(orgA, "SKU-A", excludeProductId: productA.ProductId);
        Assert.False(existsWithExclude);

        // 3. Different SKU
        var existsDiff = await repository.ExistsBySkuAsync(orgA, "SKU-NONEXISTENT");
        Assert.False(existsDiff);

        // 4. Scoped to Tenant: SKU-B belongs to OrgB, checking under OrgA returns false
        var existsCrossTenant = await repository.ExistsBySkuAsync(orgA, "SKU-B");
        Assert.False(existsCrossTenant);
    }

    [Fact]
    public async Task ProductRepository_ExistsByBarcodeAsync_IgnoresNullAndEmptyBarcodes_AndRespectsExclusion()
    {
        var orgId = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.SetTenant(orgId);

        await using var context = CreateInMemoryContext(tenantContext);
        var repository = new ProductRepository(context);

        var cat = ProductCategory.Create(orgId, "CAT01", "Category", null, null);
        await context.ProductCategories.AddAsync(cat);

        // Product with Barcode
        var productWithBarcode = Product.Create(orgId, cat.CategoryId, "SKU-1", "123456789", "Product 1", null, null, "TAB", 0.14m, null, false, 0, new[] { CreateBaseUom() });
        // Product without Barcode (null)
        var productWithoutBarcode = Product.Create(orgId, cat.CategoryId, "SKU-2", null, "Product 2", null, null, "TAB", 0.14m, null, false, 0, new[] { CreateBaseUom() });

        await repository.AddAsync(productWithBarcode);
        await repository.AddAsync(productWithoutBarcode);
        await context.SaveChangesAsync();

        // 1. Existing Barcode matches
        Assert.True(await repository.ExistsByBarcodeAsync(orgId, "123456789"));

        // 2. Existing Barcode excluded by product's own id
        Assert.False(await repository.ExistsByBarcodeAsync(orgId, "123456789", excludeProductId: productWithBarcode.ProductId));

        // 3. Non-existent Barcode
        Assert.False(await repository.ExistsByBarcodeAsync(orgId, "999999999"));

        // 4. Null, empty, and whitespace barcodes must always return false (ignoring null barcode check)
        Assert.False(await repository.ExistsByBarcodeAsync(orgId, null!));
        Assert.False(await repository.ExistsByBarcodeAsync(orgId, string.Empty));
        Assert.False(await repository.ExistsByBarcodeAsync(orgId, "   "));
    }

    [Fact]
    public async Task ProductRepository_GetByIdWithUomsAsync_LoadsProductWithUomsAndCategory()
    {
        var orgId = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.SetTenant(orgId);

        await using var context = CreateInMemoryContext(tenantContext);
        var repository = new ProductRepository(context);

        var cat = ProductCategory.Create(orgId, "CAT01", "Antibiotics", "Antibacterial", null);
        await context.ProductCategories.AddAsync(cat);

        var baseUom = CreateBaseUom("TAB", 2.5m);
        var product = Product.Create(orgId, cat.CategoryId, "SKU-AMOX", "778899", "Amoxicillin 500mg", "Amoxicillin", "GSK", "TAB", 0.14m, null, true, 30, new[] { baseUom });
        product.AddUom("STRIP", "Strip of 10", conversionToBase: 10m, saleUnitPrice: 25m, isBase: false, isSellable: true, isPurchasable: true);
        product.AddUom("BOX", "Box of 100", conversionToBase: 100m, saleUnitPrice: 240m, isBase: false, isSellable: true, isPurchasable: true);

        await repository.AddAsync(product);
        await context.SaveChangesAsync();

        // Clear ChangeTracker to prove that navigation properties are genuinely loaded via .Include()
        // and not through EF Core's in-memory identity map / navigation fixup.
        context.ChangeTracker.Clear();

        // Query via GetByIdWithUomsAsync
        var result = await repository.GetByIdWithUomsAsync(orgId, product.ProductId);

        Assert.NotNull(result);
        Assert.Equal(product.ProductId, result.ProductId);
        Assert.Equal(orgId, result.OrganizationId);

        // Verify Category is eagerly loaded
        Assert.NotNull(result.Category);
        Assert.Equal(cat.CategoryId, result.Category.CategoryId);
        Assert.Equal("Antibiotics", result.Category.Name);

        // Verify Uoms collection is eagerly loaded
        Assert.NotNull(result.Uoms);
        Assert.Equal(3, result.Uoms.Count);
        Assert.Contains(result.Uoms, u => u.UomCode == "TAB" && u.IsBase);
        Assert.Contains(result.Uoms, u => u.UomCode == "STRIP" && u.ConversionToBase == 10m);
        Assert.Contains(result.Uoms, u => u.UomCode == "BOX" && u.ConversionToBase == 100m);
    }

    [Fact]
    public async Task ProductRepository_GetByIdWithUomsAsync_ReturnsNullWhenOrgMismatchOrNotFound()
    {
        var orgA = Guid.NewGuid();
        var orgB = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.AllowSystemBypass();

        await using var context = CreateInMemoryContext(tenantContext);
        var repository = new ProductRepository(context);

        var cat = ProductCategory.Create(orgA, "CAT01", "Cat", null, null);
        await context.ProductCategories.AddAsync(cat);

        var product = Product.Create(orgA, cat.CategoryId, "SKU-1", null, "Prod", null, null, "TAB", 0m, null, false, 0, new[] { CreateBaseUom() });
        await repository.AddAsync(product);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        // Correct org returns product
        Assert.NotNull(await repository.GetByIdWithUomsAsync(orgA, product.ProductId));

        // Wrong org returns null (tenant isolation)
        Assert.Null(await repository.GetByIdWithUomsAsync(orgB, product.ProductId));

        // Non-existent product returns null
        Assert.Null(await repository.GetByIdWithUomsAsync(orgA, Guid.NewGuid()));
    }

    [Fact]
    public async Task ProductRepository_GetPagedAsync_FiltersByIsActiveByDefault_AndRespectsFilters()
    {
        var orgId = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.SetTenant(orgId);

        await using var context = CreateInMemoryContext(tenantContext);
        var repository = new ProductRepository(context);

        var cat1 = ProductCategory.Create(orgId, "CAT01", "Analgesics", null, null);
        var cat2 = ProductCategory.Create(orgId, "CAT02", "Vitamins", null, null);
        await context.ProductCategories.AddRangeAsync(cat1, cat2);

        var pActive1 = Product.Create(orgId, cat1.CategoryId, "SKU-ACT-1", "BAR-111", "Panadol Extra", null, null, "TAB", 0.14m, null, false, 0, new[] { CreateBaseUom() });
        var pActive2 = Product.Create(orgId, cat1.CategoryId, "SKU-ACT-2", "BAR-222", "Panadol Cold & Flu", null, null, "TAB", 0.14m, null, false, 0, new[] { CreateBaseUom() });
        var pInactive = Product.Create(orgId, cat1.CategoryId, "SKU-INACT", "BAR-333", "Old Panadol", null, null, "TAB", 0.14m, null, false, 0, new[] { CreateBaseUom() });

        await repository.AddAsync(pActive1);
        await repository.AddAsync(pActive2);
        await repository.AddAsync(pInactive);
        context.Entry(pInactive).Property(p => p.IsActive).CurrentValue = false;

        var pVitamin = Product.Create(orgId, cat2.CategoryId, "SKU-VIT", "BAR-444", "Vitamin C 1000mg", null, null, "TAB", 0.14m, null, false, 0, new[] { CreateBaseUom() });
        await repository.AddAsync(pVitamin);

        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        // 1. Default (includeInactive = false): Only active returned (pActive1, pActive2, pVitamin)
        var pagedActiveOnly = await repository.GetPagedAsync(orgId, categoryId: null, includeInactive: false, search: null, page: 1, pageSize: 10);
        Assert.Equal(3, pagedActiveOnly.TotalCount);
        Assert.Equal(3, pagedActiveOnly.Items.Count);
        Assert.DoesNotContain(pagedActiveOnly.Items, p => p.ProductId == pInactive.ProductId);

        // 2. includeInactive = true: Returns all 4
        var pagedAll = await repository.GetPagedAsync(orgId, categoryId: null, includeInactive: true, search: null, page: 1, pageSize: 10);
        Assert.Equal(4, pagedAll.TotalCount);
        Assert.Contains(pagedAll.Items, p => p.ProductId == pInactive.ProductId);

        // 3. Category Filter
        var pagedCat2 = await repository.GetPagedAsync(orgId, categoryId: cat2.CategoryId, includeInactive: true, search: null, page: 1, pageSize: 10);
        Assert.Single(pagedCat2.Items);
        Assert.Equal("SKU-VIT", pagedCat2.Items[0].Sku);

        // 4. Search by Name
        var searchName = await repository.GetPagedAsync(orgId, categoryId: null, includeInactive: false, search: "Cold", page: 1, pageSize: 10);
        Assert.Single(searchName.Items);
        Assert.Equal("Panadol Cold & Flu", searchName.Items[0].Name);

        // 5. Search by SKU
        var searchSku = await repository.GetPagedAsync(orgId, categoryId: null, includeInactive: false, search: "SKU-ACT-1", page: 1, pageSize: 10);
        Assert.Single(searchSku.Items);
        Assert.Equal("Panadol Extra", searchSku.Items[0].Name);

        // 6. Search by Barcode
        var searchBarcode = await repository.GetPagedAsync(orgId, categoryId: null, includeInactive: false, search: "BAR-444", page: 1, pageSize: 10);
        Assert.Single(searchBarcode.Items);
        Assert.Equal("Vitamin C 1000mg", searchBarcode.Items[0].Name);

        // 7. Pagination page and pageSize
        var page1 = await repository.GetPagedAsync(orgId, categoryId: cat1.CategoryId, includeInactive: false, search: null, page: 1, pageSize: 1);
        Assert.Equal(2, page1.TotalCount);
        Assert.Single(page1.Items);

        var page2 = await repository.GetPagedAsync(orgId, categoryId: cat1.CategoryId, includeInactive: false, search: null, page: 2, pageSize: 1);
        Assert.Equal(2, page2.TotalCount);
        Assert.Single(page2.Items);
        Assert.NotEqual(page1.Items[0].ProductId, page2.Items[0].ProductId);
    }

    [Fact]
    public async Task ProductRepository_GetPagedAsync_EnforcesMaxPageSize_AndDefaultsInvalidPageAndPageSize()
    {
        var orgId = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.SetTenant(orgId);

        await using var context = CreateInMemoryContext(tenantContext);
        var repository = new ProductRepository(context);

        var cat = ProductCategory.Create(orgId, "CAT", "Category", null, null);
        await context.ProductCategories.AddAsync(cat);

        var product = Product.Create(orgId, cat.CategoryId, "SKU-1", null, "Panadol", null, null, "TAB", 0m, null, false, 0, new[] { CreateBaseUom() });
        await repository.AddAsync(product);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        // 1. PageSize exceeding MaxPageSize (100) is clamped to 100
        var clampedResult = await repository.GetPagedAsync(orgId, categoryId: null, includeInactive: true, search: null, page: 1, pageSize: 500);
        Assert.Equal(100, clampedResult.PageSize);
        Assert.Equal(1, clampedResult.Page);

        // 2. Non-positive PageSize (0 or negative) defaults to DefaultPageSize (10)
        var defaultZeroResult = await repository.GetPagedAsync(orgId, categoryId: null, includeInactive: true, search: null, page: 1, pageSize: 0);
        Assert.Equal(10, defaultZeroResult.PageSize);

        var defaultNegResult = await repository.GetPagedAsync(orgId, categoryId: null, includeInactive: true, search: null, page: 1, pageSize: -5);
        Assert.Equal(10, defaultNegResult.PageSize);

        // 3. Invalid page (< 1) defaults to 1
        var invalidPageResult = await repository.GetPagedAsync(orgId, categoryId: null, includeInactive: true, search: null, page: -2, pageSize: 20);
        Assert.Equal(1, invalidPageResult.Page);
        Assert.Equal(20, invalidPageResult.PageSize);
    }

    [Fact]
    public async Task ProductRepository_GetCanonicalFeedPageAsync_FiltersAndOrdersCorrectly()
    {
        var orgId = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.SetTenant(orgId);

        await using var context = CreateInMemoryContext(tenantContext);
        var repository = new ProductRepository(context);

        var cat = ProductCategory.Create(orgId, "CAT01", "Category", null, null);
        await context.ProductCategories.AddAsync(cat);

        var p1 = Product.Create(orgId, cat.CategoryId, "SKU-1", null, "Alpha", null, null, "TAB", 0m, null, false, 0, new[] { CreateBaseUom() });
        var p2 = Product.Create(orgId, cat.CategoryId, "SKU-2", null, "Beta", null, null, "TAB", 0m, null, false, 0, new[] { CreateBaseUom() });
        var p3 = Product.Create(orgId, cat.CategoryId, "SKU-3", null, "Gamma", null, null, "TAB", 0m, null, false, 0, new[] { CreateBaseUom() });

        await repository.AddAsync(p1);
        await repository.AddAsync(p2);
        await repository.AddAsync(p3);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        // Feed with limit = 2
        var feedPage = await repository.GetCanonicalFeedPageAsync(orgId, updatedSince: null, afterEventSequence: null, limit: 2);
        Assert.Equal(2, feedPage.Count);
        Assert.NotNull(feedPage[0].Uoms);
        Assert.NotNull(feedPage[0].Category);

        // Feed with updatedSince set in future returns empty
        var futureFeed = await repository.GetCanonicalFeedPageAsync(orgId, updatedSince: DateTimeOffset.UtcNow.AddHours(1), afterEventSequence: null, limit: 10);
        Assert.Empty(futureFeed);
    }

    #endregion

    #region ProductCategoryRepository Tests

    [Fact]
    public async Task ProductCategoryRepository_GetByIdAsync_And_ExistsMethods_WorkCorrectly()
    {
        var orgId = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.SetTenant(orgId);

        await using var context = CreateInMemoryContext(tenantContext);
        var repository = new ProductCategoryRepository(context);

        var catActive = ProductCategory.Create(orgId, "MED", "Medicines", "General medicines", null);
        var catInactive = ProductCategory.Create(orgId, "OLD", "Archived", "No longer used", null);
        catInactive.SetActiveState(false);

        await repository.AddAsync(catActive);
        await repository.AddAsync(catInactive);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        // GetByIdAsync
        var found = await repository.GetByIdAsync(orgId, catActive.CategoryId);
        Assert.NotNull(found);
        Assert.Equal("MED", found.Code);

        // Non-existent or wrong org
        Assert.Null(await repository.GetByIdAsync(Guid.NewGuid(), catActive.CategoryId));
        Assert.Null(await repository.GetByIdAsync(orgId, Guid.NewGuid()));

        // ExistsByCodeAsync
        Assert.True(await repository.ExistsByCodeAsync(orgId, "MED"));
        Assert.False(await repository.ExistsByCodeAsync(orgId, "MED", excludeCategoryId: catActive.CategoryId));
        Assert.False(await repository.ExistsByCodeAsync(orgId, "UNKNOWN"));

        // ExistsAndActiveAsync
        Assert.True(await repository.ExistsAndActiveAsync(orgId, catActive.CategoryId));
        Assert.False(await repository.ExistsAndActiveAsync(orgId, catInactive.CategoryId)); // inactive
        Assert.False(await repository.ExistsAndActiveAsync(orgId, Guid.NewGuid())); // not found
    }

    [Fact]
    public async Task ProductCategoryRepository_GetPagedAsync_FiltersByParentCategoryAndActive()
    {
        var orgId = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.SetTenant(orgId);

        await using var context = CreateInMemoryContext(tenantContext);
        var repository = new ProductCategoryRepository(context);

        var rootCat = ProductCategory.Create(orgId, "ROOT", "Root Category", null, null);
        await repository.AddAsync(rootCat);
        await context.SaveChangesAsync();

        var subCatActive = ProductCategory.Create(orgId, "SUB1", "Sub Category Active", null, parentCategoryId: rootCat.CategoryId);
        var subCatInactive = ProductCategory.Create(orgId, "SUB2", "Sub Category Inactive", null, parentCategoryId: rootCat.CategoryId);
        subCatInactive.SetActiveState(false);

        await repository.AddAsync(subCatActive);
        await repository.AddAsync(subCatInactive);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        // 1. Get children of rootCat with includeInactive = false
        var pagedActive = await repository.GetPagedAsync(orgId, parentCategoryId: rootCat.CategoryId, includeInactive: false, search: null, page: 1, pageSize: 10);
        Assert.Single(pagedActive.Items);
        Assert.Equal("SUB1", pagedActive.Items[0].Code);

        // 2. Get children of rootCat with includeInactive = true
        var pagedAll = await repository.GetPagedAsync(orgId, parentCategoryId: rootCat.CategoryId, includeInactive: true, search: null, page: 1, pageSize: 10);
        Assert.Equal(2, pagedAll.Items.Count);

        // 3. Search filter
        var searchResult = await repository.GetPagedAsync(orgId, parentCategoryId: null, includeInactive: true, search: "Root", page: 1, pageSize: 10);
        Assert.Single(searchResult.Items);
        Assert.Equal("ROOT", searchResult.Items[0].Code);
    }

    [Fact]
    public async Task ProductCategoryRepository_GetPagedAsync_EnforcesMaxPageSize_AndDefaultsInvalidPageAndPageSize()
    {
        var orgId = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.SetTenant(orgId);

        await using var context = CreateInMemoryContext(tenantContext);
        var repository = new ProductCategoryRepository(context);

        var cat = ProductCategory.Create(orgId, "ROOT", "Root", null, null);
        await repository.AddAsync(cat);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        // 1. PageSize exceeding MaxPageSize (100) is clamped to 100
        var clampedResult = await repository.GetPagedAsync(orgId, parentCategoryId: null, includeInactive: true, search: null, page: 1, pageSize: 250);
        Assert.Equal(100, clampedResult.PageSize);
        Assert.Equal(1, clampedResult.Page);

        // 2. Non-positive PageSize (0 or negative) defaults to DefaultPageSize (10)
        var defaultZeroResult = await repository.GetPagedAsync(orgId, parentCategoryId: null, includeInactive: true, search: null, page: 1, pageSize: 0);
        Assert.Equal(10, defaultZeroResult.PageSize);

        var defaultNegResult = await repository.GetPagedAsync(orgId, parentCategoryId: null, includeInactive: true, search: null, page: 1, pageSize: -10);
        Assert.Equal(10, defaultNegResult.PageSize);

        // 3. Invalid page (< 1) defaults to 1
        var invalidPageResult = await repository.GetPagedAsync(orgId, parentCategoryId: null, includeInactive: true, search: null, page: 0, pageSize: 15);
        Assert.Equal(1, invalidPageResult.Page);
        Assert.Equal(15, invalidPageResult.PageSize);
    }

    #endregion

    #region ProductUomRepository Tests

    [Fact]
    public async Task ProductUomRepository_Operations_WorkCorrectly()
    {
        var orgId = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.SetTenant(orgId);

        await using var context = CreateInMemoryContext(tenantContext);
        var productRepo = new ProductRepository(context);
        var uomRepo = new ProductUomRepository(context);

        var cat = ProductCategory.Create(orgId, "CAT", "Cat", null, null);
        await context.ProductCategories.AddAsync(cat);

        var baseUom = CreateBaseUom("TAB", 1m);
        var product = Product.Create(orgId, cat.CategoryId, "SKU-UOM", null, "Medicine", null, null, "TAB", 0m, null, false, 0, new[] { baseUom });
        var secondaryUom = product.AddUom("BOX", "Box", 10m, 9m, false, true, true);
        var inactiveUom = product.AddUom("PACK", "Pack", 50m, 40m, false, true, true);
        inactiveUom.Deactivate();

        await productRepo.AddAsync(product);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        // 1. GetByProductIdAsync - default active only
        var activeUoms = await uomRepo.GetByProductIdAsync(orgId, product.ProductId, includeInactive: false);
        Assert.Equal(2, activeUoms.Count);
        Assert.True(activeUoms[0].IsBase); // Base UOM ordered first
        Assert.DoesNotContain(activeUoms, u => u.UomCode == "PACK");

        // 2. GetByProductIdAsync - include inactive
        var allUoms = await uomRepo.GetByProductIdAsync(orgId, product.ProductId, includeInactive: true);
        Assert.Equal(3, allUoms.Count);

        // 3. GetByIdAsync
        var foundUom = await uomRepo.GetByIdAsync(orgId, product.ProductId, secondaryUom.ProductUomId);
        Assert.NotNull(foundUom);
        Assert.Equal("BOX", foundUom.UomCode);

        // Wrong product or wrong org returns null
        Assert.Null(await uomRepo.GetByIdAsync(orgId, Guid.NewGuid(), secondaryUom.ProductUomId));
        Assert.Null(await uomRepo.GetByIdAsync(Guid.NewGuid(), product.ProductId, secondaryUom.ProductUomId));

        // 4. ExistsByUomCodeAsync
        Assert.True(await uomRepo.ExistsByUomCodeAsync(orgId, product.ProductId, "BOX"));
        Assert.False(await uomRepo.ExistsByUomCodeAsync(orgId, product.ProductId, "BOX", excludeUomId: secondaryUom.ProductUomId));
        Assert.False(await uomRepo.ExistsByUomCodeAsync(orgId, product.ProductId, "VIAL"));
    }

    #endregion

    #region ProductReorderRuleRepository Tests

    [Fact]
    public async Task ProductReorderRuleRepository_GetByBranchAndProductAsync_MatchesCorrectly()
    {
        var orgId = Guid.NewGuid();
        var branchId = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.SetTenant(orgId);

        await using var context = CreateInMemoryContext(tenantContext);
        var productRepo = new ProductRepository(context);
        var ruleRepo = new ProductReorderRuleRepository(context);

        var cat = ProductCategory.Create(orgId, "CAT", "Cat", null, null);
        await context.ProductCategories.AddAsync(cat);

        var product = Product.Create(orgId, cat.CategoryId, "SKU-RR", null, "Medicine", null, null, "TAB", 0m, null, false, 0, new[] { CreateBaseUom() });
        await productRepo.AddAsync(product);

        var rule = ProductReorderRule.Create(orgId, product.ProductId, branchId, reorderPointBase: 10m, reorderQuantityBase: 50m, maxQuantityBase: 200m);
        await ruleRepo.AddAsync(rule);
        await context.SaveChangesAsync();
        context.ChangeTracker.Clear();

        // 1. Found by matching org, branch, and product
        var found = await ruleRepo.GetByBranchAndProductAsync(orgId, branchId, product.ProductId);
        Assert.NotNull(found);
        Assert.Equal(10m, found.ReorderPointBase);
        Assert.Equal(50m, found.ReorderQuantityBase);

        // 2. Mismatched branch returns null
        Assert.Null(await ruleRepo.GetByBranchAndProductAsync(orgId, Guid.NewGuid(), product.ProductId));

        // 3. Mismatched product returns null
        Assert.Null(await ruleRepo.GetByBranchAndProductAsync(orgId, branchId, Guid.NewGuid()));

        // 4. Mismatched org returns null
        Assert.Null(await ruleRepo.GetByBranchAndProductAsync(Guid.NewGuid(), branchId, product.ProductId));
    }

    #endregion

    #region Dependency Injection Tests

    [Fact]
    public void DependencyInjection_RegistersAllFourCatalogRepositoriesAsScoped()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().Build();

        services.AddInfrastructureServices(configuration);

        var descriptorCategory = services.FirstOrDefault(d => d.ServiceType == typeof(IProductCategoryRepository));
        var descriptorProduct = services.FirstOrDefault(d => d.ServiceType == typeof(IProductRepository));
        var descriptorUom = services.FirstOrDefault(d => d.ServiceType == typeof(IProductUomRepository));
        var descriptorReorder = services.FirstOrDefault(d => d.ServiceType == typeof(IProductReorderRuleRepository));

        Assert.NotNull(descriptorCategory);
        Assert.Equal(ServiceLifetime.Scoped, descriptorCategory.Lifetime);
        Assert.Equal(typeof(ProductCategoryRepository), descriptorCategory.ImplementationType);

        Assert.NotNull(descriptorProduct);
        Assert.Equal(ServiceLifetime.Scoped, descriptorProduct.Lifetime);
        Assert.Equal(typeof(ProductRepository), descriptorProduct.ImplementationType);

        Assert.NotNull(descriptorUom);
        Assert.Equal(ServiceLifetime.Scoped, descriptorUom.Lifetime);
        Assert.Equal(typeof(ProductUomRepository), descriptorUom.ImplementationType);

        Assert.NotNull(descriptorReorder);
        Assert.Equal(ServiceLifetime.Scoped, descriptorReorder.Lifetime);
        Assert.Equal(typeof(ProductReorderRuleRepository), descriptorReorder.ImplementationType);
    }

    #endregion
}
