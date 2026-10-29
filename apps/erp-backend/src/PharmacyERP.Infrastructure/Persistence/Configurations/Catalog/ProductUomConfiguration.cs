using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PharmacyERP.Domain.Entities.Catalog;

namespace PharmacyERP.Infrastructure.Persistence.Configurations.Catalog;

public sealed class ProductUomConfiguration : IEntityTypeConfiguration<ProductUom>
{
    public void Configure(EntityTypeBuilder<ProductUom> builder)
    {
        builder.ToTable("PRODUCT_UOM", "catalog", t =>
        {
            t.HasCheckConstraint("CK_PRODUCT_UOM_conversion_positive", "conversion_to_base > 0");
            t.HasCheckConstraint("CK_PRODUCT_UOM_base_conversion_one", "NOT is_base OR conversion_to_base = 1");
            t.HasCheckConstraint("CK_PRODUCT_UOM_sellable_price", "NOT is_sellable OR (sale_unit_price IS NOT NULL AND sale_unit_price >= 0)");
        });

        builder.HasKey(x => x.ProductUomId);
        builder.HasAlternateKey(x => new { x.OrganizationId, x.ProductId, x.ProductUomId });

        builder.Property(x => x.ProductUomId).HasColumnName("product_uom_id").ValueGeneratedNever();
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(x => x.ProductId).HasColumnName("product_id").IsRequired();
        builder.Property(x => x.UomCode).HasColumnName("uom_code").HasColumnType("varchar(20)").HasMaxLength(20).IsRequired();
        builder.Property(x => x.DisplayName).HasColumnName("display_name").HasColumnType("varchar(50)").HasMaxLength(50).IsRequired();
        builder.Property(x => x.ConversionToBase).HasColumnName("conversion_to_base").HasColumnType("numeric(18,6)").IsRequired();
        builder.Property(x => x.SaleUnitPrice).HasColumnName("sale_unit_price").HasColumnType("numeric(18,4)");
        builder.Property(x => x.IsBase).HasColumnName("is_base").IsRequired();
        builder.Property(x => x.IsSellable).HasColumnName("is_sellable").IsRequired();
        builder.Property(x => x.IsPurchasable).HasColumnName("is_purchasable").IsRequired();
        builder.Property(x => x.IsActive).HasColumnName("is_active").IsRequired();
        builder.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamptz").IsRequired();
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasColumnType("timestamptz").IsRequired();

        builder.HasIndex(x => new { x.OrganizationId, x.ProductId, x.UomCode }).IsUnique();
        builder.HasIndex(x => new { x.OrganizationId, x.ProductId }).IsUnique().HasFilter("is_base = true AND is_active = true");

        builder.HasOne(x => x.Product)
               .WithMany(p => p.Uoms)
               .HasForeignKey(x => new { x.OrganizationId, x.ProductId })
               .HasPrincipalKey(p => new { p.OrganizationId, p.ProductId })
               .OnDelete(DeleteBehavior.Restrict);
    }
}

