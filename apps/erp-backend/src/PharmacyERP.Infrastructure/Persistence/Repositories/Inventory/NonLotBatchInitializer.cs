using System;
using System.Threading;
using System.Threading.Tasks;
using PharmacyERP.Application.Common.Interfaces.CrossModule;
using PharmacyERP.Application.Features.Inventory.Interfaces;
using PharmacyERP.Domain.Entities.Inventory;
using PharmacyERP.Domain.ValueObjects;

namespace PharmacyERP.Infrastructure.Persistence.Repositories.Inventory;

public class NonLotBatchInitializer : INonLotBatchInitializer2
{
    private readonly IInventoryBatchRepository2 _batchRepository;

    public NonLotBatchInitializer(IInventoryBatchRepository2 batchRepository)
    {
        _batchRepository = batchRepository;
    }

    public async Task EnsureNonLotBatchCreatedAsync(Guid organizationId, Guid productId, CancellationToken ct = default)
    {
        Guid nonLotBatchId = DeterministicBatchIdGenerator.GenerateNonLotBatchId(organizationId, productId);
        var existing = await _batchRepository.GetByIdAsync(organizationId, productId, nonLotBatchId, ct);

        if (existing == null)
        {
            var nonLotBatch = InventoryBatch.CreateNonLotSystemBatch(organizationId, productId);
            await _batchRepository.AddAsync(nonLotBatch, ct);
        }
    }
}