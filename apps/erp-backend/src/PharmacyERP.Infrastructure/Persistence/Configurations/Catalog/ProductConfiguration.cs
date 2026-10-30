using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PharmacyERP.Domain.Entities.Catalog;

namespace PharmacyERP.Infrastructure.Persistence.Configurations.Catalog;

public sealed class ProductConfiguration : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> builder)
    {
        builder.ToTable("PRODUCT", "catalog", t =>
        {
            t.HasCheckConstraint("CK_PRODUCT_tax_rate_range", "tax_rate >= 0 AND tax_rate <= 1");
            t.HasCheckConstraint("CK_PRODUCT_expiry_alert_days_nonnegative", "expiry_alert_days >= 0");
        });

        builder.HasKey(x => x.ProductId);
        builder.HasAlternateKey(x => new { x.OrganizationId, x.ProductId });

        builder.Property(x => x.ProductId).HasColumnName("product_id").ValueGeneratedNever();
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(x => x.CategoryId).HasColumnName("category_id").IsRequired();
        builder.Property(x => x.Sku).HasColumnName("sku").HasColumnType("varchar(40)").HasMaxLength(40).IsRequired();
        builder.Property(x => x.Barcode).HasColumnName("barcode").HasColumnType("varchar(80)").HasMaxLength(80);
        builder.Property(x => x.Name).HasColumnName("name").HasColumnType("varchar(180)").HasMaxLength(180).IsRequired();
        builder.Property(x => x.GenericName).HasColumnName("generic_name").HasColumnType("varchar(180)").HasMaxLength(180);
        builder.Property(x => x.BrandName).HasColumnName("brand_name").HasColumnType("varchar(180)").HasMaxLength(180);
        builder.Property(x => x.BaseUomCode).HasColumnName("base_uom_code").HasColumnType("varchar(20)").HasMaxLength(20).IsRequired();
        builder.Property(x => x.TaxRate).HasColumnName("tax_rate").HasColumnType("numeric(9,4)").HasDefaultValue(0m).IsRequired();
        builder.Property(x => x.ImageUrl).HasColumnName("image_url").HasColumnType("varchar(300)").HasMaxLength(300);
        builder.Property(x => x.LotTrackingRequired).HasColumnName("lot_tracking_required").IsRequired();
        builder.Property(x => x.ExpiryAlertDays).HasColumnName("expiry_alert_days").IsRequired();
        builder.Property(x => x.IsActive).HasColumnName("is_active").IsRequired();
        builder.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamptz").IsRequired();
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasColumnType("timestamptz").IsRequired();

        builder.HasIndex(x => new { x.OrganizationId, x.Sku }).IsUnique();
        builder.HasIndex(x => new { x.OrganizationId, x.Barcode }).IsUnique().HasFilter("barcode IS NOT NULL");
        builder.HasIndex(x => new { x.OrganizationId, x.CategoryId, x.IsActive });
        builder.HasIndex(x => new { x.OrganizationId, x.Name });
        builder.HasIndex(x => new { x.OrganizationId, x.GenericName });
        builder.HasIndex(x => new { x.OrganizationId, x.UpdatedAt, x.ProductId });

        builder.HasOne(x => x.Category)
               .WithMany(c => c.Products)
               .HasForeignKey(x => new { x.OrganizationId, x.CategoryId })
               .HasPrincipalKey(c => new { c.OrganizationId, c.CategoryId })
               .OnDelete(DeleteBehavior.Restrict);
    }
}

