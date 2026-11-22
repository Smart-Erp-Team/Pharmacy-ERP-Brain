using System;
using System.Threading;
using System.Threading.Tasks;
using PharmacyERP.Application.Common.Interfaces.CrossModule;
using PharmacyERP.Application.Features.Inventory.Interfaces;
using PharmacyERP.Domain.ValueObjects;

namespace PharmacyERP.Infrastructure.Persistence.Repositories.Inventory;

public class NonLotBatchInitializer : INonLotBatchInitializer, INonLotBatchInitializer2
{
    private readonly IInventoryBatchRepository _batchRepository;

    public NonLotBatchInitializer(IInventoryBatchRepository batchRepository)
    {
        _batchRepository = batchRepository;
    }

    public Task EnsureNonLotBatchExistsAsync(Guid organizationId, Guid productId, CancellationToken ct = default)
    {
        return EnsureNonLotBatchCreatedAsync(organizationId, productId, ct);
    }

    public async Task EnsureNonLotBatchCreatedAsync(Guid organizationId, Guid productId, CancellationToken ct = default)
    {
        await _batchRepository.GetOrCreateBatchAsync(
            organizationId,
            productId,
            DeterministicBatchIdGenerator.NonLotBatchNumber,
            null,
            null,
            ct);
    }
}
