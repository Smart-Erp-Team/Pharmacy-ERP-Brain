using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using PharmacyERP.Domain.Entities.Catalog;
using PharmacyERP.Domain.Entities.Identity;
using PharmacyERP.Infrastructure.Persistence.Database;
using PharmacyERP.Infrastructure.Services.Context;

namespace PharmacyERP.UnitTests.Infrastructure;

public class CatalogModelConfigurationTests
{
    private static readonly Type[] CatalogEntityTypes =
    {
        typeof(ProductCategory),
        typeof(Product),
        typeof(ProductUom),
        typeof(ProductReorderRule)
    };

    private static DbContextOptions<PharmacyDbContext> BuildOptions() =>
        new DbContextOptionsBuilder<PharmacyDbContext>()
            .UseNpgsql("Host=localhost;Database=pharmacy_model_test;Username=test;Password=test")
            .Options;

    private static PharmacyDbContext CreateContext() =>
        new(BuildOptions(), new TenantContext());

    private static IModel BuildDesignTimeModel()
    {
        using var context = CreateContext();
        return context.GetService<IDesignTimeModel>().Model;
    }

    private static IEntityType Entity(IModel model, Type type)
    {
        var entity = model.FindEntityType(type);
        Assert.NotNull(entity);
        return entity;
    }

    private static string[] Names(IEnumerable<IReadOnlyProperty> properties) =>
        properties.Select(property => property.Name).ToArray();

    private static string[] ColumnNames(IEnumerable<IProperty> properties) =>
        properties.Select(property => property.GetColumnName()).ToArray();

    // ---------------------------------------------------------------------
    // Model build / validation
    // ---------------------------------------------------------------------

    [Fact]
    public void FullModel_BuildsAndValidates_AndContainsAllCatalogEntities()
    {
        using var context = CreateContext();

        // Accessing Model triggers full model finalization and validation (Identity, Integration, Catalog).
        var runtimeModel = context.Model;
        var designTimeModel = context.GetService<IDesignTimeModel>().Model;

        foreach (var type in CatalogEntityTypes)
        {
            Assert.NotNull(runtimeModel.FindEntityType(type));
            Assert.NotNull(designTimeModel.FindEntityType(type));
        }

        Assert.NotNull(runtimeModel.FindEntityType(typeof(Branch)));
    }

    [Fact]
    public void DbContext_ExposesCatalogDbSets()
    {
        using var context = CreateContext();

        Assert.Equal(typeof(ProductCategory), context.ProductCategories.EntityType.ClrType);
        Assert.Equal(typeof(Product), context.Products.EntityType.ClrType);
        Assert.Equal(typeof(ProductUom), context.ProductUoms.EntityType.ClrType);
        Assert.Equal(typeof(ProductReorderRule), context.ProductReorderRules.EntityType.ClrType);
    }

    // ---------------------------------------------------------------------
    // Schema and table names
    // ---------------------------------------------------------------------

    [Theory]
    [InlineData(typeof(ProductCategory), "PRODUCT_CATEGORY")]
    [InlineData(typeof(Product), "PRODUCT")]
    [InlineData(typeof(ProductUom), "PRODUCT_UOM")]
    [InlineData(typeof(ProductReorderRule), "PRODUCT_REORDER_RULE")]
    public void CatalogEntity_MapsToCatalogSchemaAndExpectedTable(Type type, string table)
    {
        var entity = Entity(BuildDesignTimeModel(), type);

        Assert.Equal("catalog", entity.GetSchema());
        Assert.Equal(table, entity.GetTableName());
    }

    // ---------------------------------------------------------------------
    // Primary keys
    // ---------------------------------------------------------------------

    [Theory]
    [InlineData(typeof(ProductCategory), nameof(ProductCategory.CategoryId), "category_id")]
    [InlineData(typeof(Product), nameof(Product.ProductId), "product_id")]
    [InlineData(typeof(ProductUom), nameof(ProductUom.ProductUomId), "product_uom_id")]
    [InlineData(typeof(ProductReorderRule), nameof(ProductReorderRule.ReorderRuleId), "reorder_rule_id")]
    public void CatalogEntity_HasExpectedSingleColumnPrimaryKey(Type type, string propertyName, string columnName)
    {
        var entity = Entity(BuildDesignTimeModel(), type);
        var primaryKey = entity.FindPrimaryKey();

        Assert.NotNull(primaryKey);
        Assert.Equal(new[] { propertyName }, Names(primaryKey.Properties));
        Assert.Equal(new[] { columnName }, ColumnNames(primaryKey.Properties));
        Assert.Equal(ValueGenerated.Never, primaryKey.Properties[0].ValueGenerated);
    }

    // ---------------------------------------------------------------------
    // Alternate keys
    // ---------------------------------------------------------------------

    [Theory]
    [InlineData(typeof(ProductCategory), new[] { "OrganizationId", "CategoryId" })]
    [InlineData(typeof(Product), new[] { "OrganizationId", "ProductId" })]
    [InlineData(typeof(ProductUom), new[] { "OrganizationId", "ProductId", "ProductUomId" })]
    [InlineData(typeof(ProductReorderRule), new[] { "OrganizationId", "ReorderRuleId" })]
    public void CatalogEntity_HasExpectedAlternateKey(Type type, string[] properties)
    {
        var entity = Entity(BuildDesignTimeModel(), type);

        var alternateKeys = entity.GetKeys().Where(key => !key.IsPrimaryKey()).ToList();

        Assert.Single(alternateKeys);
        Assert.Equal(properties, Names(alternateKeys[0].Properties));
    }

    [Fact]
    public void ProductUom_HasTripleAlternateKey_OrganizationProductUom()
    {
        var entity = Entity(BuildDesignTimeModel(), typeof(ProductUom));

        var key = entity.FindKey(new[]
        {
            entity.FindProperty(nameof(ProductUom.OrganizationId))!,
            entity.FindProperty(nameof(ProductUom.ProductId))!,
            entity.FindProperty(nameof(ProductUom.ProductUomId))!
        });

        Assert.NotNull(key);
        Assert.False(key.IsPrimaryKey());
        Assert.Equal(new[] { "organization_id", "product_id", "product_uom_id" }, ColumnNames(key.Properties));
    }

    // ---------------------------------------------------------------------
    // Indexes (unique, filtered, non-unique)
    // ---------------------------------------------------------------------

    public static TheoryData<Type, string[], bool, string?> ExpectedIndexes => new()
    {
        { typeof(ProductCategory), new[] { "OrganizationId", "Code" }, true, null },
        { typeof(ProductCategory), new[] { "OrganizationId", "ParentCategoryId", "IsActive" }, false, null },
        { typeof(ProductCategory), new[] { "OrganizationId", "Name" }, false, null },

        { typeof(Product), new[] { "OrganizationId", "Sku" }, true, null },
        { typeof(Product), new[] { "OrganizationId", "Barcode" }, true, "barcode IS NOT NULL" },
        { typeof(Product), new[] { "OrganizationId", "CategoryId", "IsActive" }, false, null },
        { typeof(Product), new[] { "OrganizationId", "Name" }, false, null },
        { typeof(Product), new[] { "OrganizationId", "GenericName" }, false, null },
        { typeof(Product), new[] { "OrganizationId", "UpdatedAt", "ProductId" }, false, null },

        { typeof(ProductUom), new[] { "OrganizationId", "ProductId", "UomCode" }, true, null },
        { typeof(ProductUom), new[] { "OrganizationId", "ProductId" }, true, "is_base = true AND is_active = true" },

        { typeof(ProductReorderRule), new[] { "OrganizationId", "ProductId", "BranchId" }, true, null },
        { typeof(ProductReorderRule), new[] { "OrganizationId", "BranchId", "IsActive" }, false, null }
    };

    [Theory]
    [MemberData(nameof(ExpectedIndexes))]
    public void CatalogEntity_HasExpectedIndex(Type type, string[] properties, bool isUnique, string? filter)
    {
        var entity = Entity(BuildDesignTimeModel(), type);

        var matches = entity.GetIndexes()
            .Where(index => Names(index.Properties).SequenceEqual(properties))
            .ToList();

        var index = Assert.Single(matches);
        Assert.Equal(isUnique, index.IsUnique);
        Assert.Equal(filter, index.GetFilter());
    }

    [Theory]
    [InlineData(typeof(ProductCategory), 3)]
    [InlineData(typeof(Product), 6)]
    [InlineData(typeof(ProductUom), 2)]
    [InlineData(typeof(ProductReorderRule), 2)]
    public void CatalogEntity_HasOnlyTheSpecifiedIndexes(Type type, int expectedCount)
    {
        var entity = Entity(BuildDesignTimeModel(), type);

        Assert.Equal(expectedCount, entity.GetIndexes().Count());
    }

    // ---------------------------------------------------------------------
    // Check constraints
    // ---------------------------------------------------------------------

    [Theory]
    [InlineData(typeof(ProductCategory), "CK_PRODUCT_CATEGORY_no_self_parent", "parent_category_id IS NULL OR parent_category_id <> category_id")]
    [InlineData(typeof(Product), "CK_PRODUCT_tax_rate_range", "tax_rate >= 0 AND tax_rate <= 1")]
    [InlineData(typeof(Product), "CK_PRODUCT_expiry_alert_days_nonnegative", "expiry_alert_days >= 0")]
    [InlineData(typeof(ProductUom), "CK_PRODUCT_UOM_conversion_positive", "conversion_to_base > 0")]
    [InlineData(typeof(ProductUom), "CK_PRODUCT_UOM_base_conversion_one", "NOT is_base OR conversion_to_base = 1")]
    [InlineData(typeof(ProductUom), "CK_PRODUCT_UOM_sellable_price", "NOT is_sellable OR (sale_unit_price IS NOT NULL AND sale_unit_price >= 0)")]
    [InlineData(typeof(ProductReorderRule), "CK_PRODUCT_REORDER_RULE_nonnegative", "reorder_point_base >= 0 AND reorder_quantity_base >= 0")]
    [InlineData(typeof(ProductReorderRule), "CK_PRODUCT_REORDER_RULE_max_ge_point", "max_quantity_base IS NULL OR max_quantity_base >= reorder_point_base")]
    public void CatalogEntity_HasCheckConstraint(Type type, string name, string sql)
    {
        var entity = Entity(BuildDesignTimeModel(), type);

        var constraint = entity.GetCheckConstraints().SingleOrDefault(c => c.Name == name);

        Assert.NotNull(constraint);
        Assert.Equal(sql, constraint.Sql);
    }

    [Theory]
    [InlineData(typeof(ProductCategory), 1)]
    [InlineData(typeof(Product), 2)]
    [InlineData(typeof(ProductUom), 3)]
    [InlineData(typeof(ProductReorderRule), 2)]
    public void CatalogEntity_HasExactlyTheSpecifiedCheckConstraints(Type type, int expectedCount)
    {
        var entity = Entity(BuildDesignTimeModel(), type);

        Assert.Equal(expectedCount, entity.GetCheckConstraints().Count());
    }

    // ---------------------------------------------------------------------
    // Columns: names, types, precision, lengths, nullability
    // ---------------------------------------------------------------------

    public static TheoryData<Type, string, string, string, int?, bool> ExpectedColumns => new()
    {
        // ProductCategory
        { typeof(ProductCategory), "CategoryId", "category_id", "uuid", null, false },
        { typeof(ProductCategory), "OrganizationId", "organization_id", "uuid", null, false },
        { typeof(ProductCategory), "ParentCategoryId", "parent_category_id", "uuid", null, true },
        { typeof(ProductCategory), "Code", "code", "varchar(30)", 30, false },
        { typeof(ProductCategory), "Name", "name", "varchar(100)", 100, false },
        { typeof(ProductCategory), "Description", "description", "varchar(250)", 250, true },
        { typeof(ProductCategory), "IsActive", "is_active", "boolean", null, false },
        { typeof(ProductCategory), "CreatedAt", "created_at", "timestamptz", null, false },
        { typeof(ProductCategory), "UpdatedAt", "updated_at", "timestamptz", null, false },

        // Product
        { typeof(Product), "ProductId", "product_id", "uuid", null, false },
        { typeof(Product), "OrganizationId", "organization_id", "uuid", null, false },
        { typeof(Product), "CategoryId", "category_id", "uuid", null, false },
        { typeof(Product), "Sku", "sku", "varchar(40)", 40, false },
        { typeof(Product), "Barcode", "barcode", "varchar(80)", 80, true },
        { typeof(Product), "Name", "name", "varchar(180)", 180, false },
        { typeof(Product), "GenericName", "generic_name", "varchar(180)", 180, true },
        { typeof(Product), "BrandName", "brand_name", "varchar(180)", 180, true },
        { typeof(Product), "BaseUomCode", "base_uom_code", "varchar(20)", 20, false },
        { typeof(Product), "TaxRate", "tax_rate", "numeric(9,4)", null, false },
        { typeof(Product), "ImageUrl", "image_url", "varchar(300)", 300, true },
        { typeof(Product), "LotTrackingRequired", "lot_tracking_required", "boolean", null, false },
        { typeof(Product), "ExpiryAlertDays", "expiry_alert_days", "integer", null, false },
        { typeof(Product), "IsActive", "is_active", "boolean", null, false },
        { typeof(Product), "CreatedAt", "created_at", "timestamptz", null, false },
        { typeof(Product), "UpdatedAt", "updated_at", "timestamptz", null, false },

        // ProductUom
        { typeof(ProductUom), "ProductUomId", "product_uom_id", "uuid", null, false },
        { typeof(ProductUom), "OrganizationId", "organization_id", "uuid", null, false },
        { typeof(ProductUom), "ProductId", "product_id", "uuid", null, false },
        { typeof(ProductUom), "UomCode", "uom_code", "varchar(20)", 20, false },
        { typeof(ProductUom), "DisplayName", "display_name", "varchar(50)", 50, false },
        { typeof(ProductUom), "ConversionToBase", "conversion_to_base", "numeric(18,6)", null, false },
        { typeof(ProductUom), "SaleUnitPrice", "sale_unit_price", "numeric(18,4)", null, true },
        { typeof(ProductUom), "IsBase", "is_base", "boolean", null, false },
        { typeof(ProductUom), "IsSellable", "is_sellable", "boolean", null, false },
        { typeof(ProductUom), "IsPurchasable", "is_purchasable", "boolean", null, false },
        { typeof(ProductUom), "IsActive", "is_active", "boolean", null, false },
        { typeof(ProductUom), "CreatedAt", "created_at", "timestamptz", null, false },
        { typeof(ProductUom), "UpdatedAt", "updated_at", "timestamptz", null, false },

        // ProductReorderRule
        { typeof(ProductReorderRule), "ReorderRuleId", "reorder_rule_id", "uuid", null, false },
        { typeof(ProductReorderRule), "OrganizationId", "organization_id", "uuid", null, false },
        { typeof(ProductReorderRule), "ProductId", "product_id", "uuid", null, false },
        { typeof(ProductReorderRule), "BranchId", "branch_id", "uuid", null, false },
        { typeof(ProductReorderRule), "ReorderPointBase", "reorder_point_base", "numeric(18,4)", null, false },
        { typeof(ProductReorderRule), "ReorderQuantityBase", "reorder_quantity_base", "numeric(18,4)", null, false },
        { typeof(ProductReorderRule), "MaxQuantityBase", "max_quantity_base", "numeric(18,4)", null, true },
        { typeof(ProductReorderRule), "IsActive", "is_active", "boolean", null, false },
        { typeof(ProductReorderRule), "CreatedAt", "created_at", "timestamptz", null, false },
        { typeof(ProductReorderRule), "UpdatedAt", "updated_at", "timestamptz", null, false }
    };

    [Theory]
    [MemberData(nameof(ExpectedColumns))]
    public void CatalogColumn_HasExpectedNameTypeLengthAndNullability(
        Type type,
        string propertyName,
        string columnName,
        string columnType,
        int? maxLength,
        bool isNullable)
    {
        var entity = Entity(BuildDesignTimeModel(), type);
        var property = entity.FindProperty(propertyName);

        Assert.NotNull(property);
        Assert.Equal(columnName, property.GetColumnName());
        Assert.Equal(columnType, property.GetColumnType());
        Assert.Equal(maxLength, property.GetMaxLength());
        Assert.Equal(isNullable, property.IsNullable);
        Assert.Equal(isNullable, property.IsColumnNullable());
    }

    [Theory]
    [InlineData(typeof(ProductCategory), 9)]
    [InlineData(typeof(Product), 16)]
    [InlineData(typeof(ProductUom), 13)]
    [InlineData(typeof(ProductReorderRule), 10)]
    public void CatalogEntity_HasNoShadowOrUnexpectedColumns(Type type, int expectedPropertyCount)
    {
        var entity = Entity(BuildDesignTimeModel(), type);
        var properties = entity.GetProperties().ToList();

        Assert.Equal(expectedPropertyCount, properties.Count);
        Assert.DoesNotContain(properties, property => property.IsShadowProperty());
    }

    [Fact]
    public void AllCatalogColumns_AreSnakeCase()
    {
        var model = BuildDesignTimeModel();
        var snakeCase = new Regex("^[a-z][a-z0-9]*(_[a-z0-9]+)*$");

        foreach (var type in CatalogEntityTypes)
        {
            foreach (var property in Entity(model, type).GetProperties())
            {
                var column = property.GetColumnName();
                Assert.True(snakeCase.IsMatch(column), $"{type.Name}.{property.Name} maps to non snake_case column '{column}'.");
            }
        }
    }

    [Fact]
    public void ProductTaxRate_HasDatabaseDefaultZero()
    {
        var entity = Entity(BuildDesignTimeModel(), typeof(Product));
        var taxRate = entity.FindProperty(nameof(Product.TaxRate))!;

        Assert.Equal(0m, taxRate.GetDefaultValue());
    }

    // ---------------------------------------------------------------------
    // Foreign keys
    // ---------------------------------------------------------------------

    public static TheoryData<Type, string, Type, string[], string[], string[], bool> ExpectedForeignKeys => new()
    {
        {
            typeof(ProductCategory), nameof(ProductCategory.Parent), typeof(ProductCategory),
            new[] { "OrganizationId", "ParentCategoryId" },
            new[] { "OrganizationId", "CategoryId" },
            new[] { "organization_id", "parent_category_id" },
            false
        },
        {
            typeof(Product), nameof(Product.Category), typeof(ProductCategory),
            new[] { "OrganizationId", "CategoryId" },
            new[] { "OrganizationId", "CategoryId" },
            new[] { "organization_id", "category_id" },
            true
        },
        {
            typeof(ProductUom), nameof(ProductUom.Product), typeof(Product),
            new[] { "OrganizationId", "ProductId" },
            new[] { "OrganizationId", "ProductId" },
            new[] { "organization_id", "product_id" },
            true
        },
        {
            typeof(ProductReorderRule), nameof(ProductReorderRule.Product), typeof(Product),
            new[] { "OrganizationId", "ProductId" },
            new[] { "OrganizationId", "ProductId" },
            new[] { "organization_id", "product_id" },
            true
        },
        {
            typeof(ProductReorderRule), nameof(ProductReorderRule.Branch), typeof(Branch),
            new[] { "OrganizationId", "BranchId" },
            new[] { "OrganizationId", "BranchId" },
            new[] { "organization_id", "branch_id" },
            true
        }
    };

    [Theory]
    [MemberData(nameof(ExpectedForeignKeys))]
    public void CatalogForeignKey_IsCompositeOnOrganizationAndRestrict(
        Type dependentType,
        string navigationName,
        Type principalType,
        string[] dependentProperties,
        string[] principalProperties,
        string[] dependentColumns,
        bool isRequired)
    {
        var entity = Entity(BuildDesignTimeModel(), dependentType);
        var navigation = entity.FindNavigation(navigationName);

        Assert.NotNull(navigation);
        var foreignKey = navigation.ForeignKey;

        Assert.Equal(principalType, foreignKey.PrincipalEntityType.ClrType);
        Assert.Equal(dependentProperties, Names(foreignKey.Properties));
        Assert.Equal(principalProperties, Names(foreignKey.PrincipalKey.Properties));
        Assert.Equal(dependentColumns, ColumnNames(foreignKey.Properties));
        Assert.False(foreignKey.PrincipalKey.IsPrimaryKey());
        Assert.False(foreignKey.IsUnique);
        Assert.Equal(isRequired, foreignKey.IsRequired);
        Assert.Equal(DeleteBehavior.Restrict, foreignKey.DeleteBehavior);
    }

    [Theory]
    [InlineData(typeof(ProductCategory), 1)]
    [InlineData(typeof(Product), 1)]
    [InlineData(typeof(ProductUom), 1)]
    [InlineData(typeof(ProductReorderRule), 2)]
    public void CatalogEntity_HasOnlySpecifiedForeignKeys_AllRestrict(Type type, int expectedCount)
    {
        var entity = Entity(BuildDesignTimeModel(), type);
        var foreignKeys = entity.GetForeignKeys().ToList();

        Assert.Equal(expectedCount, foreignKeys.Count);
        Assert.All(foreignKeys, fk => Assert.Equal(DeleteBehavior.Restrict, fk.DeleteBehavior));
    }

    [Fact]
    public void CatalogInverseNavigations_AreWiredToCollections()
    {
        var model = BuildDesignTimeModel();

        var category = Entity(model, typeof(ProductCategory));
        Assert.Equal(nameof(ProductCategory.Parent), category.FindNavigation(nameof(ProductCategory.Children))!.Inverse!.Name);
        Assert.Equal(nameof(Product.Category), category.FindNavigation(nameof(ProductCategory.Products))!.Inverse!.Name);

        var product = Entity(model, typeof(Product));
        Assert.Equal(nameof(ProductUom.Product), product.FindNavigation(nameof(Product.Uoms))!.Inverse!.Name);
        Assert.Equal(nameof(ProductReorderRule.Product), product.FindNavigation(nameof(Product.ReorderRules))!.Inverse!.Name);
    }

    // ---------------------------------------------------------------------
    // Tenant global query filter
    // ---------------------------------------------------------------------

    [Theory]
    [InlineData(typeof(ProductCategory))]
    [InlineData(typeof(Product))]
    [InlineData(typeof(ProductUom))]
    [InlineData(typeof(ProductReorderRule))]
    public void CatalogEntity_HasTenantQueryFilterOnOrganizationId(Type type)
    {
        using var context = CreateContext();
        var entity = Entity(context.Model, type);

        var filters = entity.GetDeclaredQueryFilters();

        Assert.NotEmpty(filters);
        Assert.Contains(filters, filter =>
            filter.Expression is not null &&
            filter.Expression.ToString().Contains("OrganizationId", StringComparison.Ordinal));
    }

    [Fact]
    public void CatalogQueries_TranslateWithOrganizationIdPredicate_WhenTenantIsBound()
    {
        var tenantContext = new TenantContext();
        tenantContext.SetTenant(Guid.NewGuid());
        using var context = new PharmacyDbContext(BuildOptions(), tenantContext);

        var queries = new[]
        {
            context.ProductCategories.ToQueryString(),
            context.Products.ToQueryString(),
            context.ProductUoms.ToQueryString(),
            context.ProductReorderRules.ToQueryString()
        };

        Assert.All(queries, sql =>
        {
            Assert.True(
                sql.Contains("WHERE", StringComparison.Ordinal) &&
                sql.Contains(".organization_id =", StringComparison.Ordinal),
                $"Tenant predicate not found in generated SQL:{Environment.NewLine}{sql}");
        });
    }

    // ---------------------------------------------------------------------
    // Generated DDL (no database connection required)
    // ---------------------------------------------------------------------

    [Fact]
    public void GeneratedCreateScript_ContainsCatalogDdlFragments()
    {
        using var context = CreateContext();
        var script = context.Database.GenerateCreateScript();

        var expectedFragments = new[]
        {
            "CREATE TABLE catalog.\"PRODUCT_CATEGORY\"",
            "CREATE TABLE catalog.\"PRODUCT\"",
            "CREATE TABLE catalog.\"PRODUCT_UOM\"",
            "CREATE TABLE catalog.\"PRODUCT_REORDER_RULE\"",

            "tax_rate numeric(9,4) NOT NULL DEFAULT 0.0",
            "conversion_to_base numeric(18,6) NOT NULL",
            "sale_unit_price numeric(18,4)",
            "reorder_point_base numeric(18,4) NOT NULL",
            "created_at timestamptz NOT NULL",
            "sku varchar(40) NOT NULL",
            "barcode varchar(80)",

            "CONSTRAINT \"CK_PRODUCT_CATEGORY_no_self_parent\" CHECK (parent_category_id IS NULL OR parent_category_id <> category_id)",
            "CONSTRAINT \"CK_PRODUCT_tax_rate_range\" CHECK (tax_rate >= 0 AND tax_rate <= 1)",
            "CONSTRAINT \"CK_PRODUCT_expiry_alert_days_nonnegative\" CHECK (expiry_alert_days >= 0)",
            "CONSTRAINT \"CK_PRODUCT_UOM_conversion_positive\" CHECK (conversion_to_base > 0)",
            "CONSTRAINT \"CK_PRODUCT_UOM_base_conversion_one\" CHECK (NOT is_base OR conversion_to_base = 1)",
            "CONSTRAINT \"CK_PRODUCT_UOM_sellable_price\" CHECK (NOT is_sellable OR (sale_unit_price IS NOT NULL AND sale_unit_price >= 0))",
            "CONSTRAINT \"CK_PRODUCT_REORDER_RULE_nonnegative\" CHECK (reorder_point_base >= 0 AND reorder_quantity_base >= 0)",
            "CONSTRAINT \"CK_PRODUCT_REORDER_RULE_max_ge_point\" CHECK (max_quantity_base IS NULL OR max_quantity_base >= reorder_point_base)",

            "UNIQUE (organization_id, product_id, product_uom_id)",
            "ON catalog.\"PRODUCT_UOM\" (organization_id, product_id) WHERE is_base = true AND is_active = true",
            "ON catalog.\"PRODUCT\" (organization_id, barcode) WHERE barcode IS NOT NULL",

            "FOREIGN KEY (organization_id, parent_category_id) REFERENCES catalog.\"PRODUCT_CATEGORY\" (organization_id, category_id) ON DELETE RESTRICT",
            "FOREIGN KEY (organization_id, category_id) REFERENCES catalog.\"PRODUCT_CATEGORY\" (organization_id, category_id) ON DELETE RESTRICT",
            "FOREIGN KEY (organization_id, product_id) REFERENCES catalog.\"PRODUCT\" (organization_id, product_id) ON DELETE RESTRICT",
            "FOREIGN KEY (organization_id, branch_id) REFERENCES identity.\"BRANCH\" (organization_id, branch_id) ON DELETE RESTRICT"
        };

        foreach (var fragment in expectedFragments)
            Assert.Contains(fragment, script, StringComparison.Ordinal);
    }
}
