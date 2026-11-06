using PharmacyERP.Application.Common.Interfaces.CrossModule;

namespace PharmacyERP.Application.Features.Catalog.Services.Implementations;

/// <summary>
/// Temporary fail-safe implementation of <see cref="IProductInventoryUsageChecker"/> for Developer 2's Catalog module.
/// </summary>
/// <remarks>
/// Both methods return <c>true</c> by default (fail-safe mode). This deliberately and safely blocks any modifications
/// to LotTrackingRequired, BaseUomCode, or UOM ConversionToBase until Developer 3's real Inventory implementation is integrated,
/// preventing potentially corrupting changes to products that might have existing stock or historical transactions.
/// </remarks>
public class TemporaryProductInventoryUsageChecker : IProductInventoryUsageChecker
{
    public Task<bool> HasAnyStockOrPostedHistoryForProductAsync(Guid organizationId, Guid productId, CancellationToken ct = default)
    {
        return Task.FromResult(true);
    }

    public Task<bool> HasAnyStockOrDocumentReferenceForUomAsync(Guid organizationId, Guid productId, Guid productUomId, CancellationToken ct = default)
    {
        return Task.FromResult(true);
    }
}

