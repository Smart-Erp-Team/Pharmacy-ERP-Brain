using System;
using System.Threading;
using System.Threading.Tasks;

namespace PharmacyERP.Application.Common.Interfaces.CrossModule;

public interface INonLotBatchInitializer
{
    Task EnsureNonLotBatchCreatedAsync(Guid organizationId, Guid productId, CancellationToken ct = default);
}
