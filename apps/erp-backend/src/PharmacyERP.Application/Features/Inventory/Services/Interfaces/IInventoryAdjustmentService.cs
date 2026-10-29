using System;
using System.Threading;
using System.Threading.Tasks;
using PharmacyERP.Application.Common.DTOs;
using PharmacyERP.Application.Features.Inventory.DTOs;

namespace PharmacyERP.Application.Features.Inventory.Services.Interfaces;

public interface IInventoryAdjustmentService
{
	Task<Result<InventoryTxnDto>> PostAdjustmentAsync(CreateInventoryAdjustmentRequest request, CancellationToken ct = default);
}