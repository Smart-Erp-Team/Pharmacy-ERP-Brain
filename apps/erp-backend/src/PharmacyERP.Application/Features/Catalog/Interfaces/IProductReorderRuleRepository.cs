using PharmacyERP.Domain.Entities.Catalog;

namespace PharmacyERP.Application.Features.Catalog.Interfaces;

/// <summary>
/// Repository interface for catalog product reorder rules.
/// </summary>
public interface IProductReorderRuleRepository
{
    Task<ProductReorderRule?> GetByBranchAndProductAsync(
        Guid organizationId,
        Guid branchId,
        Guid productId,
        CancellationToken ct = default);

    Task AddAsync(ProductReorderRule rule, CancellationToken ct = default);
}

