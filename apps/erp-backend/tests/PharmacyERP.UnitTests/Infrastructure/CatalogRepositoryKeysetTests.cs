using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using PharmacyERP.Domain.Entities.Catalog;
using PharmacyERP.Infrastructure.Persistence.Database;
using PharmacyERP.Infrastructure.Persistence.Repositories.Catalog;
using PharmacyERP.Infrastructure.Services.Context;
using Xunit;

namespace PharmacyERP.UnitTests.Infrastructure;

public class CatalogRepositoryKeysetTests
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

    private static void SetUpdatedAt(Product product, DateTimeOffset timestamp)
    {
        var prop = typeof(Product).GetProperty("UpdatedAt", BindingFlags.Public | BindingFlags.Instance);
        prop?.SetValue(product, timestamp);
    }

    [Fact]
    public async Task GetCanonicalFeedKeysetPageAsync_OrdersByUpdatedAtThenProductId()
    {
        var orgId = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.AllowSystemBypass();

        await using var context = CreateInMemoryContext(tenantContext);
        var repository = new ProductRepository(context);

        var cat = ProductCategory.Create(orgId, "CAT-01", "General", null, null);
        await context.ProductCategories.AddAsync(cat);

        var p1 = Product.Create(orgId, cat.CategoryId, "SKU-01", null, "Alpha", null, null, "TAB", 0.14m, null, false, 0, new[] { CreateBaseUom() });
        var p2 = Product.Create(orgId, cat.CategoryId, "SKU-02", null, "Beta", null, null, "TAB", 0.14m, null, false, 0, new[] { CreateBaseUom() });
        var p3 = Product.Create(orgId, cat.CategoryId, "SKU-03", null, "Gamma", null, null, "TAB", 0.14m, null, false, 0, new[] { CreateBaseUom() });

        var baseTime = DateTimeOffset.UtcNow;
        SetUpdatedAt(p1, baseTime.AddMinutes(10));
        SetUpdatedAt(p2, baseTime.AddMinutes(5));
        SetUpdatedAt(p3, baseTime.AddMinutes(15));

        await repository.AddAsync(p1);
        await repository.AddAsync(p2);
        await repository.AddAsync(p3);
        await context.SaveChangesAsync();

        var (items, hasNextPage) = await repository.GetCanonicalFeedKeysetPageAsync(
            orgId, updatedSince: null, afterUpdatedAt: null, afterProductId: null, limit: 10);

        Assert.Equal(3, items.Count);
        Assert.False(hasNextPage);
        Assert.Equal("SKU-02", items[0].Sku);
        Assert.Equal("SKU-01", items[1].Sku);
        Assert.Equal("SKU-03", items[2].Sku);
    }

    [Fact]
    public async Task GetCanonicalFeedKeysetPageAsync_RespectsTenantIsolation()
    {
        var orgA = Guid.NewGuid();
        var orgB = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.AllowSystemBypass();

        await using var context = CreateInMemoryContext(tenantContext);
        var repository = new ProductRepository(context);

        var catA = ProductCategory.Create(orgA, "CAT-A", "Org A Cat", null, null);
        var catB = ProductCategory.Create(orgB, "CAT-B", "Org B Cat", null, null);
        await context.ProductCategories.AddRangeAsync(catA, catB);

        var pA = Product.Create(orgA, catA.CategoryId, "SKU-A", null, "Prod A", null, null, "TAB", 0.14m, null, false, 0, new[] { CreateBaseUom() });
        var pB = Product.Create(orgB, catB.CategoryId, "SKU-B", null, "Prod B", null, null, "TAB", 0.14m, null, false, 0, new[] { CreateBaseUom() });

        await repository.AddAsync(pA);
        await repository.AddAsync(pB);
        await context.SaveChangesAsync();

        var (itemsA, _) = await repository.GetCanonicalFeedKeysetPageAsync(
            orgA, updatedSince: null, afterUpdatedAt: null, afterProductId: null, limit: 10);

        Assert.Single(itemsA);
        Assert.Equal("SKU-A", itemsA[0].Sku);
    }

    [Fact]
    public async Task GetCanonicalFeedKeysetPageAsync_FiltersByUpdatedSince()
    {
        var orgId = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.AllowSystemBypass();

        await using var context = CreateInMemoryContext(tenantContext);
        var repository = new ProductRepository(context);

        var cat = ProductCategory.Create(orgId, "CAT-01", "General", null, null);
        await context.ProductCategories.AddAsync(cat);

        var now = DateTimeOffset.UtcNow;
        var pOld = Product.Create(orgId, cat.CategoryId, "OLD", null, "Old", null, null, "TAB", 0.14m, null, false, 0, new[] { CreateBaseUom() });
        var pNew = Product.Create(orgId, cat.CategoryId, "NEW", null, "New", null, null, "TAB", 0.14m, null, false, 0, new[] { CreateBaseUom() });

        SetUpdatedAt(pOld, now.AddDays(-2));
        SetUpdatedAt(pNew, now);

        await repository.AddAsync(pOld);
        await repository.AddAsync(pNew);
        await context.SaveChangesAsync();

        var threshold = now.AddDays(-1);
        var (items, _) = await repository.GetCanonicalFeedKeysetPageAsync(
            orgId, updatedSince: threshold, afterUpdatedAt: null, afterProductId: null, limit: 10);

        Assert.Single(items);
        Assert.Equal("NEW", items[0].Sku);
    }

    [Fact]
    public async Task GetCanonicalFeedKeysetPageAsync_HandlesPagingAndCursorCorrectly_WithIdenticalTimestamps()
    {
        var orgId = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.AllowSystemBypass();

        await using var context = CreateInMemoryContext(tenantContext);
        var repository = new ProductRepository(context);

        var cat = ProductCategory.Create(orgId, "CAT-01", "General", null, null);
        await context.ProductCategories.AddAsync(cat);

        var fixedTime = new DateTimeOffset(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);
        var products = new List<Product>();

        for (int i = 1; i <= 5; i++)
        {
            var p = Product.Create(orgId, cat.CategoryId, $"SKU-{i:D2}", null, $"Product {i}", null, null, "TAB", 0.14m, null, false, 0, new[] { CreateBaseUom() });
            SetUpdatedAt(p, fixedTime);
            products.Add(p);
            await repository.AddAsync(p);
        }

        await context.SaveChangesAsync();

        // Page 1: limit 2
        var (page1Items, page1HasNext) = await repository.GetCanonicalFeedKeysetPageAsync(
            orgId, updatedSince: null, afterUpdatedAt: null, afterProductId: null, limit: 2);

        Assert.Equal(2, page1Items.Count);
        Assert.True(page1HasNext);

        var lastItemPage1 = page1Items[1];

        // Page 2: limit 2, using cursor from page 1
        var (page2Items, page2HasNext) = await repository.GetCanonicalFeedKeysetPageAsync(
            orgId, updatedSince: null, afterUpdatedAt: lastItemPage1.UpdatedAt, afterProductId: lastItemPage1.ProductId, limit: 2);

        Assert.Equal(2, page2Items.Count);
        Assert.True(page2HasNext);

        var lastItemPage2 = page2Items[1];

        // Page 3: limit 2, using cursor from page 2
        var (page3Items, page3HasNext) = await repository.GetCanonicalFeedKeysetPageAsync(
            orgId, updatedSince: null, afterUpdatedAt: lastItemPage2.UpdatedAt, afterProductId: lastItemPage2.ProductId, limit: 2);

        Assert.Single(page3Items);
        Assert.False(page3HasNext);

        // Verify no duplicate IDs across all retrieved pages
        var allIds = page1Items.Concat(page2Items).Concat(page3Items).Select(p => p.ProductId).ToList();
        Assert.Equal(5, allIds.Count);
        Assert.Equal(5, allIds.Distinct().Count());
    }

    [Fact]
    public void GetCanonicalFeedKeysetPageAsync_GeneratesValidNpgsqlSql()
    {
        var orgId = Guid.NewGuid();
        var tenantContext = new TenantContext();
        tenantContext.AllowSystemBypass();

        var options = new DbContextOptionsBuilder<PharmacyDbContext>()
            .UseNpgsql("Host=localhost;Database=dummy;Username=postgres;Password=dummy")
            .Options;

        using var context = new PharmacyDbContext(options, tenantContext);
        
        var afterTime = DateTimeOffset.UtcNow;
        var afterId = Guid.NewGuid();
        var limit = 50;

        var query = context.Products
            .Include(p => p.Uoms)
            .Include(p => p.Category)
            .Where(p => p.OrganizationId == orgId)
            .Where(p => p.UpdatedAt > afterTime || (p.UpdatedAt == afterTime && p.ProductId.CompareTo(afterId) > 0))
            .OrderBy(p => p.UpdatedAt)
            .ThenBy(p => p.ProductId)
            .Take(limit + 1);

        var sql = query.ToQueryString();
        Assert.NotNull(sql);
        Assert.Contains("p.organization_id = @orgId", sql);
        Assert.Contains("p.updated_at > @afterTime OR (p.updated_at = @afterTime AND p.product_id > @afterId)", sql);
        Assert.Contains("ORDER BY p.updated_at, p.product_id", sql);
        Assert.Contains("LIMIT @p", sql);
    }
}

