namespace PharmacyERP.Application.Common.Interfaces.CrossModule;

public interface INonLotBatchInitializer2
{
    Task EnsureNonLotBatchCreatedAsync(Guid organizationId, Guid productId, CancellationToken ct = default);
}
