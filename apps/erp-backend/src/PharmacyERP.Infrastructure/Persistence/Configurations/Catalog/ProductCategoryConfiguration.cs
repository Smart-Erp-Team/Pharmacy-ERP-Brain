using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PharmacyERP.Domain.Entities.Catalog;

namespace PharmacyERP.Infrastructure.Persistence.Configurations.Catalog;

public sealed class ProductCategoryConfiguration : IEntityTypeConfiguration<ProductCategory>
{
    public void Configure(EntityTypeBuilder<ProductCategory> builder)
    {
        builder.ToTable("PRODUCT_CATEGORY", "catalog", t =>
        {
            t.HasCheckConstraint("CK_PRODUCT_CATEGORY_no_self_parent", "parent_category_id IS NULL OR parent_category_id <> category_id");
        });

        builder.HasKey(x => x.CategoryId);
        builder.HasAlternateKey(x => new { x.OrganizationId, x.CategoryId });

        builder.Property(x => x.CategoryId).HasColumnName("category_id").ValueGeneratedNever();
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(x => x.ParentCategoryId).HasColumnName("parent_category_id");
        builder.Property(x => x.Code).HasColumnName("code").HasColumnType("varchar(30)").HasMaxLength(30).IsRequired();
        builder.Property(x => x.Name).HasColumnName("name").HasColumnType("varchar(100)").HasMaxLength(100).IsRequired();
        builder.Property(x => x.Description).HasColumnName("description").HasColumnType("varchar(250)").HasMaxLength(250);
        builder.Property(x => x.IsActive).HasColumnName("is_active").IsRequired();
        builder.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamptz").IsRequired();
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasColumnType("timestamptz").IsRequired();

        builder.HasIndex(x => new { x.OrganizationId, x.Code }).IsUnique();
        builder.HasIndex(x => new { x.OrganizationId, x.ParentCategoryId, x.IsActive });
        builder.HasIndex(x => new { x.OrganizationId, x.Name });

        builder.HasOne(x => x.Parent)
               .WithMany(x => x.Children)
               .HasForeignKey(x => new { x.OrganizationId, x.ParentCategoryId })
               .HasPrincipalKey(x => new { x.OrganizationId, x.CategoryId })
               .IsRequired(false)
               .OnDelete(DeleteBehavior.Restrict);
    }
}

