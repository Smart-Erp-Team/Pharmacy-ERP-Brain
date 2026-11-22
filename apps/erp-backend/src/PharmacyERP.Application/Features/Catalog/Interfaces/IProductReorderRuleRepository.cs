namespace PharmacyERP.Application.Features.Catalog.Interfaces;

/// <summary>
/// Repository interface for catalog product reorder rules.
/// </summary>
public interface IProductReorderRuleRepository
{
    Task AcquireUpsertLockAsync(
        Guid organizationId,
        Guid branchId,
        Guid productId,
        CancellationToken ct = default);

    Task<ProductReorderRule?> GetByBranchAndProductAsync(
        Guid organizationId,
        Guid branchId,
        Guid productId,
        CancellationToken ct = default);

    Task<ProductReorderRule?> GetByBranchAndProductReadOnlyAsync(
        Guid organizationId,
        Guid branchId,
        Guid productId,
        CancellationToken ct = default);

    Task AddAsync(ProductReorderRule rule, CancellationToken ct = default);
}
