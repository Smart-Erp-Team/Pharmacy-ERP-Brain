using PharmacyERP.Application.Common.Interfaces.CrossModule;

namespace PharmacyERP.Application.Features.Catalog.Services.Implementations;

/// <summary>
/// Temporary implementation of <see cref="INonLotBatchInitializer"/> for Developer 2's Catalog module.
/// </summary>
/// <remarks>
/// This temporary implementation performs no batch creation and returns a completed task.
/// Creating a non-lot product during this development stage will temporarily not initialize its NON-LOT batch.
/// To be replaced by Developer 3's real implementation in the Inventory module once integrated.
/// </remarks>
public class TemporaryNonLotBatchInitializer : INonLotBatchInitializer
{
    public Task EnsureNonLotBatchExistsAsync(Guid organizationId, Guid productId, CancellationToken ct = default)
    {
        return Task.CompletedTask;
    }
}

