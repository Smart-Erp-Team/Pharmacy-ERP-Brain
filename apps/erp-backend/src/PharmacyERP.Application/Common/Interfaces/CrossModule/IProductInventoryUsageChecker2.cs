using System;
using System.Threading;
using System.Threading.Tasks;

namespace PharmacyERP.Application.Common.Interfaces.CrossModule;

public interface IProductInventoryUsageChecker2
{
	Task<bool> HasInventoryUsageAsync(Guid organizationId, Guid productId, Guid? productUomId = null, CancellationToken ct = default);
}