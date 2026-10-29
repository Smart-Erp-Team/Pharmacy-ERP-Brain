using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using PharmacyERP.Domain.Entities.Catalog;

namespace PharmacyERP.Infrastructure.Persistence.Configurations.Catalog;

public sealed class ProductReorderRuleConfiguration : IEntityTypeConfiguration<ProductReorderRule>
{
    public void Configure(EntityTypeBuilder<ProductReorderRule> builder)
    {
        builder.ToTable("PRODUCT_REORDER_RULE", "catalog", t =>
        {
            t.HasCheckConstraint("CK_PRODUCT_REORDER_RULE_nonnegative", "reorder_point_base >= 0 AND reorder_quantity_base >= 0");
            t.HasCheckConstraint("CK_PRODUCT_REORDER_RULE_max_ge_point", "max_quantity_base IS NULL OR max_quantity_base >= reorder_point_base");
        });

        builder.HasKey(x => x.ReorderRuleId);
        builder.HasAlternateKey(x => new { x.OrganizationId, x.ReorderRuleId });

        builder.Property(x => x.ReorderRuleId).HasColumnName("reorder_rule_id").ValueGeneratedNever();
        builder.Property(x => x.OrganizationId).HasColumnName("organization_id").IsRequired();
        builder.Property(x => x.ProductId).HasColumnName("product_id").IsRequired();
        builder.Property(x => x.BranchId).HasColumnName("branch_id").IsRequired();
        builder.Property(x => x.ReorderPointBase).HasColumnName("reorder_point_base").HasColumnType("numeric(18,4)").IsRequired();
        builder.Property(x => x.ReorderQuantityBase).HasColumnName("reorder_quantity_base").HasColumnType("numeric(18,4)").IsRequired();
        builder.Property(x => x.MaxQuantityBase).HasColumnName("max_quantity_base").HasColumnType("numeric(18,4)");
        builder.Property(x => x.IsActive).HasColumnName("is_active").IsRequired();
        builder.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamptz").IsRequired();
        builder.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasColumnType("timestamptz").IsRequired();

        builder.HasIndex(x => new { x.OrganizationId, x.ProductId, x.BranchId }).IsUnique();
        builder.HasIndex(x => new { x.OrganizationId, x.BranchId, x.IsActive });

        builder.HasOne(x => x.Product)
               .WithMany(p => p.ReorderRules)
               .HasForeignKey(x => new { x.OrganizationId, x.ProductId })
               .HasPrincipalKey(p => new { p.OrganizationId, p.ProductId })
               .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(x => x.Branch)
               .WithMany()
               .HasForeignKey(x => new { x.OrganizationId, x.BranchId })
               .HasPrincipalKey(b => new { b.OrganizationId, b.BranchId })
               .OnDelete(DeleteBehavior.Restrict);
    }
}

